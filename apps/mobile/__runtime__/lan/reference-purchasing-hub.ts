/**
 * Reference purchasing hub — an in-memory, contract-faithful implementation of the
 * `/v1/purchasing/*` routes the companion depends on.
 *
 * WHY THIS EXISTS
 * ---------------
 * The Rust hub (`packages/local-store/src/purchasing-hub.rs`) is the authority, but
 * it cannot execute in Node. Every client call goes through an injected
 * `PurchasingWire`, so the real client code — the durable outbox, the status
 * lookup before a resend, the refusal handling, the offline snapshot — can be
 * executed against a hub that obeys the documented wire contract.
 *
 * WHAT THIS IS NOT
 * ----------------
 * Not TLS, not certificate pinning, not SQLCipher, not the Rust hub. It proves the
 * *client* honours the contract and pins the contract so both sides can be tested
 * against it. It is never evidence that the desktop implementation behaves this
 * way; `cargo test` covers that.
 *
 * It deliberately reproduces the hub's *hard* rules rather than a convenient
 * approximation:
 *  - an operation identity is answered from the journal forever, even when the
 *    request that produced it was a refusal;
 *  - reusing an identity with different request content is `409`, not a replay;
 *  - a stale `expectedRevision` refuses and reports the current revision;
 *  - receiving credits only `quantity - damaged`, and an over-receipt is refused;
 *  - a payment needs permission and never exceeds the outstanding invoice;
 *  - a return cannot exceed what was received and not already returned.
 */

export type ReferenceRole = 'owner' | 'manager' | 'assistant_manager' | 'cashier';

type Supplier = {
  id: string;
  name: string;
  phone: string | null;
  gstin: string | null;
  address: string | null;
  paymentTermsDays: number;
  notes: string;
  archived: boolean;
  revision: number;
};

type OrderLine = {
  lineIndex: number;
  productId: string;
  name: string;
  sku: string;
  unit: string;
  quantityMilli: number;
  receivedMilli: number;
  unitCostPaise: number;
  taxBps: number;
  lineSubtotalPaise: number;
  taxPaise: number;
  lineTotalPaise: number;
};

type Order = {
  id: string;
  number: number;
  supplierId: string;
  status: 'draft' | 'submitted' | 'approved' | 'rejected' | 'cancelled' | 'partial' | 'received' | 'closed';
  note: string;
  lines: OrderLine[];
  subtotalPaise: number;
  taxPaise: number;
  totalPaise: number;
  revision: number;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
};

type Receipt = {
  id: string;
  orderId: string;
  orderNumber: number;
  supplierId: string;
  reference: string | null;
  note: string;
  lines: {
    lineIndex: number;
    productId: string;
    quantityMilli: number;
    damagedMilli: number;
    unitCostPaise: number;
    lineTotalPaise: number;
    note: string;
  }[];
  goodsTotalPaise: number;
  damagedTotalPaise: number;
  orderStatus: string;
  createdAt: string;
};

type Invoice = {
  id: string;
  supplierId: string;
  receiptId: string | null;
  reference: string;
  totalPaise: number;
  outstandingPaise: number;
  dueOn: string | null;
  createdAt: string;
};

type Payment = {
  id: string;
  supplierId: string;
  invoiceId: string | null;
  method: string;
  amountPaise: number;
  reference: string;
  paidOn: string | null;
  createdAt: string;
};

type PurchaseReturn = {
  id: string;
  supplierId: string;
  receiptId: string;
  disposition: string;
  refundMethod: string | null;
  totalPaise: number;
  reason: string;
  createdAt: string;
};

export type ReferencePurchasingHubOptions = {
  hubId: string;
  businessId: string;
  /** Fail the next N requests before any work is done (network down). */
  dropNext?: number;
  /** Commit, then lose the reply: the exactly-once scenario. */
  loseNextResponse?: number;
};

const ID = /^[a-zA-Z0-9_-]{1,80}$/;

export function referencePurchasingHub(options: ReferencePurchasingHubOptions) {
  const suppliers = new Map<string, Supplier>();
  const orders = new Map<string, Order>();
  const receipts: Receipt[] = [];
  const invoices: Invoice[] = [];
  const payments: Payment[] = [];
  const returns: PurchaseReturn[] = [];
  /** `${receiptId}#${lineIndex}` -> milli already returned against that line. */
  const returned = new Map<string, number>();
  const products = new Map<string, { id: string; name: string; sku: string; unit: string; revision: number }>();

  const employees = new Map<string, { password: string; displayName: string; role: ReferenceRole }>();
  const devices = new Map<string, { credential: string; approved: boolean; actorId: string }>();
  const sessions = new Map<string, { actorId: string; expires: number }>();
  /** operationId -> committed document, plus the request digest that produced it. */
  const journal = new Map<string, { digest: string; kind: string; document: Record<string, unknown> }>();

  let orderNumber = 0;
  // Real time, not a fixed date: sessions must actually be live relative to the
  // phone's clock, and `createdAt` values must be plausible timestamps. The
  // factory is still deterministic in ordering, because each call advances by
  // one second from the previous value.
  let clock = Date.now();
  const now = () => new Date((clock += 1000)).toISOString();

  let dropped = options.dropNext ?? 0;
  let lostResponses = options.loseNextResponse ?? 0;

  function failAfterCommit() {
    if (lostResponses > 0) {
      lostResponses -= 1;
      throw Object.assign(new Error('Simulated response loss after commit.'), {
        code: 'network_unavailable',
      });
    }
  }

  function can(role: ReferenceRole, permission: string): boolean {
    switch (permission) {
      case 'supplierRead':
      case 'managePurchaseOrders':
      case 'receiveStock':
        // Assistant managers hold these; a bare cashier does not.
        return ['owner', 'manager', 'assistant_manager'].includes(role);
      case 'manageSuppliers':
      case 'approvePurchaseOrders':
      case 'paySuppliers':
      case 'correctPayables':
      case 'refund':
        return ['owner', 'manager'].includes(role);
      default:
        return false;
    }
  }

  function requireSession(bearer: string) {
    const session = sessions.get(bearer);
    if (!session) throw { status: 401, body: { error: 'session_required' } };
    const employee = employees.get(session.actorId);
    if (!employee) throw { status: 403, body: { error: 'access_refused' } };
    return { session, employee };
  }

  function totals(lines: { quantityMilli: number; unitCostPaise: number; taxBps: number }[]) {
    let subtotal = 0;
    let tax = 0;
    for (const line of lines) {
      const base = Math.floor((line.quantityMilli * line.unitCostPaise + 500) / 1000);
      const lineTax = Math.floor((base * line.taxBps + 5000) / 10000);
      subtotal += base;
      tax += lineTax;
    }
    return { subtotalPaise: subtotal, taxPaise: tax, totalPaise: subtotal + tax };
  }

  function buildLines(inputs: unknown[], existing?: OrderLine[]): OrderLine[] {
    if (!Array.isArray(inputs) || inputs.length === 0 || inputs.length > 500) {
      throw { status: 400, body: { error: 'invalid_request' } };
    }
    return inputs.map((raw, index) => {
      const input = raw as Record<string, unknown>;
      const product = products.get(String(input.productId));
      const quantity = Number(input.quantityMilli);
      const cost = Number(input.unitCostPaise);
      const taxBps = Number(input.taxBps ?? 0);
      if (
        !product ||
        !Number.isSafeInteger(quantity) ||
        quantity <= 0 ||
        !Number.isSafeInteger(cost) ||
        cost < 0 ||
        !Number.isSafeInteger(taxBps) ||
        taxBps < 0 ||
        taxBps > 10000
      ) {
        throw { status: 400, body: { error: 'invalid_request' } };
      }
      const base = Math.floor((quantity * cost + 500) / 1000);
      const lineTax = Math.floor((base * taxBps + 5000) / 10000);
      // Received quantity is preserved across edits for the same product/line.
      const received = existing?.[index]?.receivedMilli ?? 0;
      return {
        lineIndex: index,
        productId: product.id,
        name: product.name,
        sku: product.sku,
        unit: product.unit,
        quantityMilli: quantity,
        receivedMilli: received,
        unitCostPaise: cost,
        taxBps,
        lineSubtotalPaise: base,
        taxPaise: lineTax,
        lineTotalPaise: base + lineTax,
      };
    });
  }

  function orderDocument(order: Order) {
    return {
      ...order,
      supplierName: suppliers.get(order.supplierId)?.name ?? '',
      lines: order.lines.map((line) => ({ ...line })),
    };
  }

  function summary(order: Order) {
    return {
      id: order.id,
      number: order.number,
      supplierId: order.supplierId,
      supplierName: suppliers.get(order.supplierId)?.name ?? '',
      status: order.status,
      totalPaise: order.totalPaise,
      revision: order.revision,
      itemCount: order.lines.length,
      updatedAt: order.updatedAt,
    };
  }

  function supplierDocument(supplier: Supplier) {
    const balance = payments
      .filter((p) => p.supplierId === supplier.id)
      .reduce((sum, p) => sum - p.amountPaise, 0);
    return { ...supplier, balancePaise: String(balance), overduePaise: '0' };
  }

  function workspace(actorId: string) {
    const employee = employees.get(actorId)!;
    const role = employee.role;
    return {
      version: 1,
      businessId: options.businessId,
      generatedAt: now(),
      actorId,
      displayName: employee.displayName,
      role,
      capabilities: {
        supplierRead: can(role, 'supplierRead'),
        manageSuppliers: can(role, 'manageSuppliers'),
        managePurchaseOrders: can(role, 'managePurchaseOrders'),
        approvePurchaseOrders: can(role, 'approvePurchaseOrders'),
        receiveStock: can(role, 'receiveStock'),
        paySuppliers: can(role, 'paySuppliers'),
        correctPayables: can(role, 'correctPayables'),
        refund: can(role, 'refund'),
      },
      suppliers: [...suppliers.values()].map(supplierDocument),
      purchaseOrders: [...orders.values()].map(summary),
      receipts: receipts.map((r) => ({
        id: r.id,
        orderId: r.orderId,
        orderNumber: r.orderNumber,
        supplierId: r.supplierId,
        reference: r.reference,
        note: r.note,
        goodsTotalPaise: r.goodsTotalPaise,
        damagedTotalPaise: r.damagedTotalPaise,
        createdAt: r.createdAt,
      })),
      invoices: invoices.map((i) => ({ ...i })),
      payments: payments.map((p) => ({ ...p })),
      returns: returns.map((r) => ({ ...r })),
      products: [...products.values()],
    };
  }

  function orderDetail(orderId: string) {
    const order = orders.get(orderId);
    if (!order) throw { status: 404, body: { error: 'order_missing' } };
    return {
      version: 1,
      order: orderDocument(order),
      receipts: receipts.filter((r) => r.orderId === orderId).map((r) => ({ ...r })),
      returns: returns.filter((r) => receipts.find((x) => x.id === r.receiptId)?.orderId === orderId),
    };
  }

  function statement(supplierId: string) {
    const supplier = suppliers.get(supplierId);
    if (!supplier) throw { status: 404, body: { error: 'supplier_missing' } };
    const entries: Record<string, unknown>[] = [];
    let running = 0;
    for (const payment of payments.filter((p) => p.supplierId === supplierId)) {
      running -= payment.amountPaise;
      entries.push({
        sequence: entries.length + 1,
        operationId: payment.id,
        kind: 'payment',
        amountPaise: String(-payment.amountPaise),
        runningBalancePaise: String(running),
        createdAt: payment.createdAt,
        dueOn: null,
        reference: payment.reference,
        purchaseOrderId: null,
        receiptId: null,
        invoiceId: payment.invoiceId,
        reverseOf: null,
        reason: 'Supplier payment',
      });
    }
    return {
      version: 1,
      statement: {
        supplier: supplierDocument(supplier),
        through: entries.length,
        nextAfter: entries.length,
        hasMore: false,
        openingBalancePaise: '0',
        closingBalancePaise: String(running),
        aging: {
          currentPaise: String(running),
          days1To30Paise: '0',
          days31To60Paise: '0',
          days61To90Paise: '0',
          days90PlusPaise: '0',
        },
        entries,
      },
    };
  }

  function refusal(reason: string, revision: number | null) {
    return { status: 'refused', reason, revision };
  }

  /** Applies one purchasing operation and returns the committed document. */
  function apply(kind: string, request: Record<string, unknown>, role: ReferenceRole): Record<string, unknown> {
    const operationId = String(request.operationId ?? '');
    if (!ID.test(operationId)) throw { status: 400, body: { error: 'invalid_request' } };

    switch (kind) {
      case 'purchasing.supplier_saved': {
        if (!can(role, 'manageSuppliers')) return refusal('not_permitted', null);
        const supplierId = String(request.id ?? '');
        const existing = suppliers.get(supplierId);
        if (existing) {
          if (request.expectedRevision !== existing.revision) {
            return refusal('supplier_revision_conflict', existing.revision);
          }
          const next: Supplier = {
            ...existing,
            name: String(request.name ?? existing.name),
            notes: String(request.notes ?? existing.notes),
            archived: request.archived === true,
            revision: existing.revision + 1,
          };
          suppliers.set(supplierId, next);
          return { status: 'accepted', kind, result: supplierDocument(next) };
        }
        if (request.expectedRevision !== null && request.expectedRevision !== undefined) {
          return refusal('supplier_missing', null);
        }
        if (!ID.test(supplierId) || String(request.name ?? '').trim() === '') {
          return refusal('invalid_supplier', null);
        }
        const created: Supplier = {
          id: supplierId,
          name: String(request.name).trim(),
          phone: (request.phone as string | null) ?? null,
          gstin: (request.gstin as string | null) ?? null,
          address: (request.address as string | null) ?? null,
          paymentTermsDays: Number(request.paymentTermsDays ?? 30),
          notes: String(request.notes ?? ''),
          archived: request.archived === true,
          revision: 1,
        };
        suppliers.set(supplierId, created);
        return { status: 'accepted', kind, result: supplierDocument(created) };
      }

      case 'purchasing.purchase_order_created': {
        if (!can(role, 'managePurchaseOrders')) return refusal('not_permitted', null);
        const supplier = suppliers.get(String(request.supplierId ?? ''));
        if (!supplier || supplier.archived) return refusal('supplier_missing', null);
        const lines = buildLines(request.lines as unknown[]);
        const sum = totals(lines);
        const order: Order = {
          id: operationId,
          number: ++orderNumber,
          supplierId: supplier.id,
          status: 'draft',
          note: String(request.note ?? ''),
          lines,
          ...sum,
          revision: 1,
          createdAt: now(),
          updatedAt: now(),
          approvedAt: null,
        };
        orders.set(order.id, order);
        return { status: 'accepted', kind, result: orderDocument(order) };
      }

      case 'purchasing.purchase_order_updated': {
        if (!can(role, 'managePurchaseOrders')) return refusal('not_permitted', null);
        const order = orders.get(String(request.id ?? ''));
        if (!order) return refusal('order_missing', null);
        if (order.status !== 'draft') return refusal('order_state_refused', order.revision);
        if (order.revision !== request.expectedRevision) {
          return refusal('revision_conflict', order.revision);
        }
        const lines = buildLines(request.lines as unknown[], order.lines);
        const next: Order = {
          ...order,
          note: String(request.note ?? order.note),
          lines,
          ...totals(lines),
          revision: order.revision + 1,
          updatedAt: now(),
        };
        orders.set(order.id, next);
        return { status: 'accepted', kind, result: orderDocument(next) };
      }

      case 'purchasing.purchase_order_submitted':
      case 'purchasing.purchase_order_cancelled': {
        if (!can(role, 'managePurchaseOrders')) return refusal('not_permitted', null);
        const order = orders.get(String(request.id ?? ''));
        if (!order) return refusal('order_missing', null);
        const from = kind.endsWith('submitted') ? 'draft' : 'submitted';
        const to = kind.endsWith('submitted') ? 'submitted' : 'cancelled';
        if (order.status !== from) return refusal('order_state_refused', order.revision);
        if (order.revision !== request.expectedRevision) {
          return refusal('revision_conflict', order.revision);
        }
        order.status = to;
        order.revision += 1;
        order.updatedAt = now();
        return { status: 'accepted', kind, result: orderDocument(order) };
      }

      case 'purchasing.purchase_order_decided': {
        const decision = String(request.decision ?? '');
        const needs = decision === 'approve' ? 'approvePurchaseOrders' : 'managePurchaseOrders';
        if (!can(role, needs)) return refusal('not_permitted', null);
        const order = orders.get(String(request.id ?? ''));
        if (!order) return refusal('order_missing', null);
        if (order.status !== 'submitted') return refusal('order_state_refused', order.revision);
        if (order.revision !== request.expectedRevision) {
          return refusal('revision_conflict', order.revision);
        }
        if (decision === 'approve') {
          order.status = 'approved';
          order.approvedAt = now();
        } else if (decision === 'reject') {
          order.status = 'rejected';
        } else {
          return refusal('invalid_purchase_order', null);
        }
        order.revision += 1;
        order.updatedAt = now();
        return { status: 'accepted', kind, result: orderDocument(order) };
      }

      case 'purchasing.purchase_order_closed': {
        if (!can(role, 'managePurchaseOrders')) return refusal('not_permitted', null);
        const order = orders.get(String(request.id ?? ''));
        if (!order) return refusal('order_missing', null);
        if (!['approved', 'partial', 'received'].includes(order.status)) {
          return refusal('order_state_refused', order.revision);
        }
        if (order.revision !== request.expectedRevision) {
          return refusal('revision_conflict', order.revision);
        }
        order.status = 'closed';
        order.revision += 1;
        order.updatedAt = now();
        return { status: 'accepted', kind, result: orderDocument(order) };
      }

      case 'purchasing.goods_received': {
        if (!can(role, 'receiveStock')) return refusal('not_permitted', null);
        const order = orders.get(String(request.orderId ?? ''));
        if (!order) return refusal('order_missing', null);
        if (!['approved', 'partial'].includes(order.status)) {
          return refusal('order_state_refused', order.revision);
        }
        const inputs = (request.lines as unknown[]) ?? [];
        if (!Array.isArray(inputs) || inputs.length === 0) return refusal('invalid_receipt', null);
        let goods = 0;
        let damaged = 0;
        const prepared: Receipt['lines'] = [];
        const remaining = new Map(order.lines.map((line) => [line.lineIndex, line.quantityMilli - line.receivedMilli]));
        for (const raw of inputs) {
          const input = raw as Record<string, unknown>;
          const index = Number(input.lineIndex);
          const quantity = Number(input.quantityMilli);
          const spoilt = Number(input.damagedMilli ?? 0);
          const poLine = order.lines.find((l) => l.lineIndex === index && l.productId === input.productId);
          const left = remaining.get(index);
          if (
            !poLine ||
            left === undefined ||
            !Number.isSafeInteger(quantity) ||
            quantity <= 0 ||
            quantity > left ||
            !Number.isSafeInteger(spoilt) ||
            spoilt < 0 ||
            spoilt > quantity
          ) {
            return refusal('invalid_receipt', null);
          }
          remaining.set(index, left - quantity);
          const good = quantity - spoilt;
          const goodValue = Math.floor((good * poLine.unitCostPaise + 500) / 1000);
          goods += goodValue;
          damaged += Math.floor((spoilt * poLine.unitCostPaise + 500) / 1000);
          prepared.push({
            lineIndex: index,
            productId: poLine.productId,
            quantityMilli: quantity,
            damagedMilli: spoilt,
            unitCostPaise: poLine.unitCostPaise,
            lineTotalPaise: Math.floor((quantity * poLine.unitCostPaise + 500) / 1000),
            note: String(input.note ?? ''),
          });
        }
        for (const line of prepared) {
          const poLine = order.lines.find((l) => l.lineIndex === line.lineIndex)!;
          poLine.receivedMilli += line.quantityMilli;
        }
        order.status = order.lines.every((l) => l.receivedMilli >= l.quantityMilli)
          ? 'received'
          : 'partial';
        order.revision += 1;
        const receipt: Receipt = {
          id: operationId,
          orderId: order.id,
          orderNumber: order.number,
          supplierId: order.supplierId,
          reference: (request.reference as string | null) ?? null,
          note: String(request.note ?? ''),
          lines: prepared,
          goodsTotalPaise: goods,
          damagedTotalPaise: damaged,
          orderStatus: order.status,
          createdAt: now(),
        };
        receipts.push(receipt);
        return {
          status: 'accepted',
          kind,
          result: { ...receipt, orderStatus: order.status },
        };
      }

      case 'purchasing.supplier_payment': {
        if (!can(role, 'paySuppliers')) return refusal('not_permitted', null);
        const supplier = suppliers.get(String(request.supplierId ?? ''));
        if (!supplier) return refusal('supplier_missing', null);
        const amount = Number(request.amountPaise);
        if (!Number.isSafeInteger(amount) || amount < 1) return refusal('invalid_payable', null);
        const invoiceId = request.invoiceId as string | null;
        if (invoiceId) {
          const invoice = invoices.find((i) => i.id === invoiceId);
          if (!invoice || invoice.supplierId !== supplier.id) return refusal('invalid_payable', null);
          if (amount > invoice.outstandingPaise) return refusal('overpayment', null);
          invoice.outstandingPaise -= amount;
        }
        const payment: Payment = {
          id: operationId,
          supplierId: supplier.id,
          invoiceId,
          method: String(request.method ?? ''),
          amountPaise: amount,
          reference: String(request.reference ?? ''),
          paidOn: (request.paidOn as string | null) ?? now().slice(0, 10),
          createdAt: now(),
        };
        payments.push(payment);
        supplier.revision += 1;
        return {
          status: 'accepted',
          kind,
          result: { ...payment, balancePaise: supplierDocument(supplier).balancePaise },
        };
      }

      case 'purchasing.purchase_return': {
        if (!can(role, 'refund')) return refusal('not_permitted', null);
        const receipt = receipts.find((r) => r.id === request.receiptId);
        if (!receipt) return refusal('invalid_return', null);
        const disposition = String(request.disposition ?? '');
        if (!['supplier_credit', 'refund'].includes(disposition)) {
          return refusal('invalid_return', null);
        }
        const inputs = (request.lines as unknown[]) ?? [];
        if (!Array.isArray(inputs) || inputs.length === 0 || inputs.length > 500) {
          return refusal('invalid_return', null);
        }
        let total = 0;
        // Returnable is per received *line*: what was received, minus what
        // arrived damaged, minus what this receipt has already returned. Tracking
        // it per line is what stops one return from immunising the whole receipt.
        const taken = new Map<number, number>();
        for (const raw of inputs) {
          const input = raw as Record<string, unknown>;
          const receiptLine = Number(input.receiptLine);
          const line = receipt.lines.find((l) => l.lineIndex === receiptLine);
          if (!line || (input.productId !== undefined && input.productId !== line.productId)) {
            return refusal('invalid_return', null);
          }
          const quantity = Number(input.quantityMilli);
          const already = returned.get(`${receipt.id}#${receiptLine}`) ?? 0;
          const inThisReturn = taken.get(receiptLine) ?? 0;
          const returnable = line.quantityMilli - line.damagedMilli - already - inThisReturn;
          if (
            !Number.isSafeInteger(quantity) ||
            quantity <= 0 ||
            quantity > returnable
          ) {
            return refusal('invalid_return', null);
          }
          taken.set(receiptLine, inThisReturn + quantity);
          total += Math.floor((quantity * line.unitCostPaise + 500) / 1000);
        }
        if (total < 1) return refusal('invalid_return', null);
        const created: PurchaseReturn = {
          id: operationId,
          supplierId: receipt.supplierId,
          receiptId: receipt.id,
          disposition,
          refundMethod: (request.refundMethod as string | null) ?? null,
          totalPaise: total,
          reason: String(request.reason ?? ''),
          createdAt: now(),
        };
        for (const [receiptLine, quantity] of taken) {
          const key = `${receipt.id}#${receiptLine}`;
          returned.set(key, (returned.get(key) ?? 0) + quantity);
        }
        returns.push(created);
        return { status: 'accepted', kind, result: created };
      }

      default:
        throw { status: 400, body: { error: 'invalid_request' } };
    }
  }

  const SUPPORTED = new Set([
    'purchasing.supplier_saved',
    'purchasing.purchase_order_created',
    'purchasing.purchase_order_updated',
    'purchasing.purchase_order_submitted',
    'purchasing.purchase_order_decided',
    'purchasing.purchase_order_cancelled',
    'purchasing.purchase_order_closed',
    'purchasing.goods_received',
    'purchasing.supplier_payment',
    'purchasing.purchase_return',
  ]);

  async function handle(
    path: string,
    body: Record<string, unknown>,
    bearer: string,
  ): Promise<{ status: number; body: unknown }> {
    if (dropped > 0) {
      dropped -= 1;
      throw Object.assign(new Error('Simulated network drop before the hub was reached.'), {
        code: 'network_unavailable',
      });
    }
    if (body.version !== 1) return { status: 400, body: { error: 'invalid_request' } };
    if (body.hubId !== options.hubId || body.businessId !== options.businessId) {
      return { status: 403, body: { error: 'wrong_shop' } };
    }
    const { employee } = requireSession(bearer);

    switch (path) {
      case '/v1/purchasing/workspace': {
        if (!can(employee.role, 'supplierRead')) {
          return { status: 403, body: { error: 'access_refused' } };
        }
        return { status: 200, body: workspace(sessionActor(bearer)) };
      }
      case '/v1/purchasing/order': {
        return { status: 200, body: orderDetail(String(body.orderId ?? '')) };
      }
      case '/v1/purchasing/statement': {
        return { status: 200, body: statement(String(body.supplierId ?? '')) };
      }
      case '/v1/purchasing/operation': {
        const operationId = String(body.operationId ?? '');
        const stored = journal.get(operationId);
        if (!stored) return { status: 200, body: { status: 'not_found' } };
        // A lookup may carry the digest the caller believes it has. When the hub
        // recorded that identity for different content it must conflict — handing
        // back the old document would let a phone report *its* operation as
        // committed when a different one was.
        if (body.kind !== undefined) {
          const claimed = JSON.stringify({ kind: String(body.kind), request: body.request ?? null });
          if (claimed !== stored.digest) {
            return { status: 409, body: { error: 'operation_identity_conflict' } };
          }
        }
        return { status: 200, body: stored.document };
      }
      case '/v1/purchasing/submit': {
        const operationId = String(body.operationId ?? '');
        const kind = String(body.kind ?? '');
        if (!SUPPORTED.has(kind)) return { status: 400, body: { error: 'invalid_request' } };
        const digest = JSON.stringify({ kind, request: body.request ?? null });
        const stored = journal.get(operationId);
        if (stored) {
          if (stored.digest !== digest || stored.kind !== kind) {
            return { status: 409, body: { error: 'operation_identity_conflict' } };
          }
          return { status: 200, body: stored.document };
        }
        const document = apply(kind, (body.request as Record<string, unknown>) ?? {}, employee.role);
        journal.set(operationId, { digest, kind, document });
        failAfterCommit();
        return { status: 200, body: document };
      }
      default:
        return { status: 404, body: { error: 'not_found' } };
    }
  }

  function sessionActor(bearer: string) {
    const session = sessions.get(bearer);
    if (!session) throw { status: 401, body: { error: 'session_required' } };
    return session.actorId;
  }

  return {
    handle,
    addEmployee(actorId: string, password: string, displayName: string, role: ReferenceRole) {
      employees.set(actorId, { password, displayName, role });
    },
    addProduct(id: string, name: string, sku: string, unit = 'kg') {
      products.set(id, { id, name, sku, unit, revision: 1 });
    },
    addSupplier(supplier: Partial<Supplier> & { id: string; name: string }) {
      suppliers.set(supplier.id, {
        phone: null,
        gstin: null,
        address: null,
        paymentTermsDays: 30,
        notes: '',
        archived: false,
        revision: 1,
        ...supplier,
      });
    },
    addInvoice(invoice: Invoice) {
      invoices.push(invoice);
    },
    /** Enrol and approve a device, then return the credential to pair with. */
    pair(deviceId: string, credential: string, actorId: string) {
      devices.set(deviceId, { credential, approved: true, actorId });
    },
    expireAllSessions() {
      sessions.clear();
    },
    signIn(deviceId: string, credential: string, username: string, password: string) {
      const device = devices.get(deviceId);
      if (!device || device.credential !== credential || !device.approved) {
        throw { status: 403, body: { error: 'access_refused' } };
      }
      const employee = employees.get(username);
      if (!employee || employee.password !== password) {
        throw { status: 403, body: { error: 'access_refused' } };
      }
      const token = `token-${username}-${sessions.size + 1}`.padEnd(64, '0');
      const expires = Math.floor(clock / 1000) + 900;
      sessions.set(token, { actorId: username, expires });
      return { token, expires, actorId: username, displayName: employee.displayName };
    },
    dropNextRequests(n: number) {
      dropped = n;
    },
    loseNextResponses(n: number) {
      lostResponses = n;
    },
    updateOrder(orderId: string, mutate: (order: Order) => void) {
      const order = orders.get(orderId);
      if (!order) throw new Error('No such order');
      mutate(order);
    },
    order(orderId: string) {
      return orders.get(orderId);
    },
    orders() {
      return [...orders.values()];
    },
    payments() {
      return payments;
    },
    receipts() {
      return receipts;
    },
    returns() {
      return returns;
    },
    suppliers() {
      return [...suppliers.values()];
    },
    journal,
  };
}

export type ReferencePurchasingHub = ReturnType<typeof referencePurchasingHub>;

/**
 * Adapts the reference hub to the client's injected wire. The real wire performs
 * TLS and certificate pinning first; this stands in for transport only, and
 * reproduces the same failure surface (`HubConnectionError`-shaped errors) so the
 * client's error paths run for real.
 */
export function purchasingWireFor(hub: ReferencePurchasingHub) {
  return async (path: string, body: Record<string, unknown>, bearer: string) => {
    let reply: { status: number; body: unknown };
    try {
      reply = await hub.handle(path, body, bearer);
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (status === 401) {
        throw Object.assign(new Error('session_required'), { code: 'session_required' });
      }
      if (status === 403) {
        throw Object.assign(new Error('access_refused'), { code: 'access_refused' });
      }
      throw error;
    }
    if (reply.status === 409) {
      throw Object.assign(new Error('operation_identity_conflict'), {
        code: 'operation_identity_conflict',
      });
    }
    if (reply.status !== 200) {
      throw Object.assign(new Error(String((reply.body as { error?: string }).error ?? 'refused')), {
        code: String((reply.body as { error?: string }).error ?? 'refused'),
      });
    }
    return reply.body;
  };
}
