#!/usr/bin/env node
/*
 * A Node stand-in for packages/local-store/examples/cashier_review_bridge.rs.
 *
 * WHAT THIS IS: a review aid. It speaks the same JSON-lines protocol, so the
 * desktop acceptance checks can be exercised end to end on a machine that has
 * no Rust toolchain - which is how the receipt check's own ordering was found
 * and proved, without waiting for a CI round trip.
 *
 * WHAT THIS IS NOT: the native store. It is an explicit, simple model of the
 * bookkeeping. It proves NOTHING about SQLCipher, about the encrypted
 * database, about the real store's permissions, or about any native
 * behaviour. The real bridge remains the authority, and CI always uses it.
 *
 * Usage:
 *   SORNIO_REVIEW_BRIDGE=apps/desktop/mock-review-bridge.cjs \
 *     node apps/desktop/check-receipts.cjs http://127.0.0.1:1420 <chromium> <outdir>
 */
/* eslint-disable @typescript-eslint/no-require-imports -- Standalone review runner. */
const readline = require('node:readline');

const fail = code => { const error = new Error(code); error.code = code; return error; };

const state = {
  configured: false,
  unlocked: false,
  principal: null,
  scope: { businessId: 'mock-business', workspaceId: 'mock-workspace' },
  staff: [],
  products: [],
  customers: [],
  invoices: [],
  outbox: [],
  balances: { cashPaise: '0', creditPaise: '0' },
  draft: { revision: 1, draft: null },
  copies: [],
  pendingInventory: null,
  pendingCredit: null,
  prepared: new Map(),
  retailPayments: {},
  invoiceOwners: {},
  sequence: 0,
};

// The acceptance spawns two bridges over the same database path, exactly as
// the Rust bridge does, so the state has to be shared between the processes.
const statePath = `${process.argv[2] || 'mock'}.state.json`;
const fs = require('node:fs');
function loadState() {
  try {
    const saved = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    Object.assign(state, saved);
    state.prepared = new Map();
  } catch { /* first process to touch the file */ }
}
function saveState() {
  // The prepared requests are per-process; only the durable bookkeeping is shared.
  const rest = { ...state };
  delete rest.prepared;
  fs.writeFileSync(statePath, JSON.stringify(rest, null, 2));
}

function requireUnlocked() {
  if (!state.configured) throw fail('not_configured');
  if (!state.unlocked) throw fail('locked');
  // A staff account that is disabled has its session revoked: the native
  // store refuses every scoped call with "locked", and the app returns to
  // the access gate.
  const staff = state.staff.find(s => s.username === state.principal?.username);
  if (staff && staff.enabled === false) throw fail('locked');
}

function nextId(prefix) { state.sequence += 1; return `${prefix}-${state.sequence}`; }

function roundPaise(value) { return Math.round(value); }

function productFor(id) {
  const product = state.products.find(p => p.id === id);
  if (!product) throw fail('invalid_product');
  return product;
}

function buildInvoice(request) {
  const lines = request.lines.map(line => {
    const product = productFor(line.productId);
    const totalPaise = roundPaise(product.unitPricePaise * line.quantityMilli / 1000);
    return { productId: product.id, name: product.name, unit: product.unit, quantityMilli: line.quantityMilli, unitPricePaise: product.unitPricePaise, totalPaise };
  });
  const subtotalPaise = lines.reduce((sum, line) => sum + line.totalPaise, 0);
  const taxPaise = roundPaise(subtotalPaise * request.taxBasisPoints / 10000);
  return {
    id: nextId('inv'),
    invoiceNumber: nextId('no'),
    businessId: state.scope.businessId,
    businessName: state.businessName ?? 'Mock shop',
    createdAt: new Date().toISOString(),
    lines,
    subtotalPaise,
    taxPaise,
    totalPaise: subtotalPaise + taxPaise,
    taxBasisPoints: request.taxBasisPoints,
    tender: request.tender,
    customerId: request.customerId ?? null,
  };
}

function postInvoice(request) {
  const invoice = buildInvoice(request);
  for (const line of invoice.lines) {
    const product = productFor(line.productId);
    product.stockMilli -= line.quantityMilli;
    if (product.stockMilli < 0) throw fail('stock_conflict');
    product.revision += 1;
  }
  state.invoices.push(invoice);
  state.invoiceOwners[invoice.id] = state.principal?.username ?? 'owner';
  state.outbox.push({ operationId: request.operationId, invoiceId: invoice.id, createdAt: invoice.createdAt });
  return invoice;
}

function postRetail(request) {
  const action = request.action;
  if (action.kind !== 'sale') throw fail('invalid_payment');
  const invoice = buildInvoice(action.invoice);
  for (const line of invoice.lines) {
    const product = productFor(line.productId);
    product.stockMilli -= line.quantityMilli;
    if (product.stockMilli < 0) throw fail('stock_conflict');
    product.revision += 1;
  }
  const payments = action.payments.map(part => ({
    id: part.id,
    invoiceId: invoice.id,
    method: part.method,
    amountPaise: part.amountPaise,
    refundablePaise: part.amountPaise,
    status: part.method === 'cash' ? 'recorded' : part.method === 'credit' ? 'credit_due' : 'pending',
    revision: 1,
    reference: part.reference,
    externallyVerified: false,
  }));
  state.invoices.push(invoice);
  state.invoiceOwners[invoice.id] = state.principal?.username ?? 'owner';
  state.retailPayments[invoice.id] = payments;
  let cash = BigInt(state.balances.cashPaise);
  let credit = BigInt(state.balances.creditPaise);
  for (const payment of payments) {
    if (payment.method === 'cash') cash += BigInt(payment.amountPaise);
    if (payment.method === 'credit') credit += BigInt(payment.amountPaise);
  }
  state.balances = { cashPaise: String(cash), creditPaise: String(credit) };
  state.outbox.push({ operationId: request.operationId, invoiceId: invoice.id, createdAt: invoice.createdAt });
  return { operationId: request.operationId, kind: 'sale', data: { invoice, payments } };
}

function cashierState() {
  return {
    activeHeldBill: null,
    products: state.products.map(p => ({ ...p })),
    checkout: null,
    reportsAllowed: state.principal?.role !== 'cashier',
    balances: { ...state.balances },
  };
}

function retailView(day, username, invoiceId) {
  const invoice = invoiceId ? state.invoices.find(i => i.id === invoiceId) ?? null : null;
  const payments = invoice ? (state.retailPayments[invoice.id] ?? []).map(p => ({ ...p })) : [];
  return {
    summary: {
      day, username, actorId: state.principal?.id ?? 'owner', through: state.invoices.length,
      openingFloatPaise: 0, openingFloatId: null, netCashPaise: '0', expectedCashPaise: '0',
      countedCashPaise: null, variancePaise: null, cashRecordedPaise: '0', digitalRecordedPaise: '0',
      digitalPendingPaise: '0', manuallyMatchedPaise: '0', externallyVerifiedPaise: '0',
      refundPendingPaise: '0', unattributedCashPaise: '0', closingId: null, state: 'open',
    },
    pending: null,
    invoice,
    payments,
    refunds: [],
  };
}

const handlers = {
  workspace_access_status: () => ({ configured: state.configured, unlocked: state.unlocked }),
  read_local_session: () => {
    if (!state.configured) throw fail('not_configured');
    if (!state.principal) throw fail('locked');
    return { scope: { ...state.scope }, businessName: state.businessName ?? 'Mock shop', principal: state.principal };
  },
  setup_local_access: args => {
    if (state.configured) throw fail('already_configured');
    state.configured = true;
    state.unlocked = true;
    state.businessName = args.setup.businessName ?? 'Mock shop';
    state.principal = { id: 'owner', username: args.setup.username ?? 'owner', displayName: args.setup.displayName ?? 'Owner', role: 'owner', enabled: true, revision: 1 };
    return { configured: true, unlocked: true };
  },
  unlock_workspace: args => {
    if (!state.configured) throw fail('not_configured');
    const staff = state.staff.find(s => s.username === args.username);
    if (args.username === 'owner') state.principal = { id: 'owner', username: 'owner', displayName: 'Owner', role: 'owner', enabled: true, revision: 1 };
    else if (staff) state.principal = { ...staff };
    else throw fail('incorrect_password');
    state.unlocked = true;
    return { configured: true, unlocked: true };
  },
  lock_workspace: () => { state.unlocked = false; state.principal = null; return null; },
  list_local_staff: () => state.staff.map(s => ({ ...s })),
  create_local_staff: args => {
    const details = args.details;
    if (state.staff.some(s => s.username === details.username)) throw fail('account_exists');
    const staff = { id: nextId('staff'), username: details.username, displayName: details.displayName, role: details.role, enabled: true, revision: 1 };
    state.staff.push(staff);
    return { ...staff };
  },
  change_local_staff: args => {
    const change = args.change;
    const staff = state.staff.find(s => s.id === change.id);
    if (!staff) throw fail('invalid_identity');
    if (change.role !== undefined) staff.role = change.role;
    if (change.enabled !== undefined) staff.enabled = change.enabled;
    staff.revision += 1;
    return { ...staff };
  },
  load_workspace: () => ({ ...state.draft }),
  save_workspace: args => {
    state.draft = { revision: (state.draft.revision ?? 1) + 1, draft: args.draft ?? null };
    return { ...state.draft };
  },
  restore_workspace: () => ({ ...state.draft }),
  list_workspace_copies: () => state.copies.map(c => ({ ...c })),
  pending_local_inventory: () => state.pendingInventory,
  acknowledge_local_inventory: () => { state.pendingInventory = null; return null; },
  pending_local_credit: () => state.pendingCredit,
  list_local_held_bills: () => [],
  mutate_local_held_bill: () => { throw fail('invalid_held_bill'); },
  prepare_local_held_checkout: () => { throw fail('invalid_held_bill'); },
  add_local_product: args => {
    const request = args.request;
    if (state.products.some(p => p.sku === request.sku)) throw fail('duplicate_sku');
    const product = {
      id: request.operationId, name: request.name, sku: (request.sku || '').toUpperCase(), unit: request.unit,
      unitPricePaise: request.unitPricePaise, stockMilli: request.openingStockMilli, revision: 1,
    };
    state.products.push(product);
    state.pendingInventory = { operationId: request.operationId, productId: product.id, name: product.name };
    return { ...product };
  },
  list_local_products: () => state.products.map(p => ({ ...p })),
  adjust_local_stock: args => {
    const product = productFor(args.request.productId);
    product.stockMilli = args.request.stockMilli ?? product.stockMilli + (args.request.deltaMilli ?? 0);
    product.revision += 1;
    return { ...product };
  },
  read_cashier_state: () => cashierState(),
  prepare_local_checkout: args => { state.prepared.set(args.request.operationId, args.request); return null; },
  post_local_invoice: args => {
    const invoice = postInvoice(args.request);
    state.prepared.delete(args.request.operationId);
    return invoice;
  },
  clear_local_checkout: () => null,
  prepare_local_retail: args => { state.prepared.set(args.r.operationId, args.r); return null; },
  post_local_retail: args => {
    const receipt = postRetail(args.r);
    state.prepared.delete(args.r.operationId);
    return receipt;
  },
  clear_local_retail: () => null,
  list_local_invoices: args => {
    if (state.principal?.role === 'cashier') { const error = new Error('This account does not have permission for that action.'); error.code = 'forbidden'; throw error; }
    const after = args.after ?? 0;
    return state.invoices
      .map((invoice, index) => ({ sequence: index + 1, invoice }))
      .filter(record => record.sequence > after);
  },
  read_local_invoice: args => {
    const invoice = state.invoices.find(i => i.id === args.invoiceId);
    if (!invoice) throw fail('invoice_missing');
    if (state.principal?.role === 'cashier' && state.invoiceOwners[invoice.id] !== state.principal.username) {
      const error = new Error('This account does not have permission for that action.');
      error.code = 'forbidden';
      throw error;
    }
    return invoice;
  },
  read_billing_outbox: args => {
    const after = args.after ?? 0;
    return state.outbox.slice(after);
  },
  read_local_retail: args => retailView(args.day, args.username, args.invoiceId ?? null),
  save_local_customer: args => {
    const request = args.r;
    const existing = state.customers.find(c => c.id === request.id);
    const customer = {
      id: request.id, name: request.name, phone: request.phone ?? null,
      creditLimitPaise: request.creditLimitPaise ?? null, creditDays: request.creditDays ?? 0,
      balancePaise: existing?.balancePaise ?? '0', overduePaise: '0',
      availableCreditPaise: request.creditLimitPaise === null ? null : String(request.creditLimitPaise - Number(existing?.balancePaise ?? 0)),
      revision: (existing?.revision ?? 0) + 1,
    };
    if (existing) Object.assign(existing, customer); else state.customers.push(customer);
    return { ...customer };
  },
  read_local_customer: args => {
    const customer = state.customers.find(c => c.id === args.customerId);
    if (!customer) throw fail('customer_missing');
    return { ...customer };
  },
  find_local_customers: args => {
    const search = (args.search ?? '').toLowerCase();
    return state.customers.filter(c => !search || c.name.toLowerCase().includes(search) || c.id.toLowerCase().includes(search)).map(c => ({ ...c }));
  },
  prepare_local_credit: () => null,
  post_local_credit: () => { throw fail('invalid_credit'); },
  clear_local_credit: () => null,
  link_local_credit: () => { throw fail('invalid_credit'); },
  read_customer_statement: () => { throw fail('invalid_credit'); },
  render_customer_statement: () => { throw fail('invalid_credit'); },
};

const OPEN_COMMANDS = new Set(['workspace_access_status', 'read_local_session', 'setup_local_access', 'unlock_workspace', 'lock_workspace']);

const input = readline.createInterface({ input: process.stdin });
input.on('line', line => {
  let call;
  try { call = JSON.parse(line); } catch { return; }
  let output;
  try {
    loadState();
    if (!OPEN_COMMANDS.has(call.command)) requireUnlocked();
    const handler = handlers[call.command];
    if (!handler) throw fail('invalid_invoice');
    output = { ok: true, value: handler(call.args ?? {}) };
  } catch (error) {
    output = { ok: false, error: { code: error.code ?? 'workspace_error', message: String(error.message ?? error) } };
  }
  saveState();
  process.stdout.write(JSON.stringify(output) + '\n');
});
