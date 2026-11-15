/**
 * Purchase orders (21B-2): draft, catalogue search, lines, totals, save/resume,
 * submit, approve/reject, cancel/close, search past orders.
 *
 * Two rules are structural here, not conventions:
 *  - the running total is `draftPreview`, labelled an estimate, and is replaced
 *    by the hub's integers the moment the hub answers;
 *  - a draft cannot do anything but become a draft. Nothing on this screen
 *    touches stock, invoices, payments or customer credit.
 */
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import {
  formatInr,
  formatQuantity,
  paiseFromRupeeDecimal,
  parsePaise,
  parseQuantityMilli,
  quantityFromDecimal,
} from '@sornio/mobile-contracts';
import { space } from '@sornio/mobile-design';
import type { PurchasingRead } from './client';
import type {
  PurchasingOrderLine,
  PurchasingOrderSummary,
  PurchasingProduct,
} from '../../../../packages/business-domain/src/purchasing-contract';
import { draftPreview, type PurchasingDraft } from '../../../../packages/business-domain/src/purchasing-outbox';
import {
  ActionButton,
  Body,
  Eyebrow,
  Hairline,
  Metric,
  Muted,
  Row,
  SearchField,
  Title,
} from '../components/primitives';
import { EmptyState } from '../components/primitives';
import { useTheme } from '../theme/ThemeProvider';
import { ids } from '../testing/identifiers';

/** Quantity is entered in whole or decimal units and becomes integer milli. */
function parseQuantityInput(value: string): number | null {
  try {
    return Number(parseQuantityMilli(quantityFromDecimal(value.trim())));
  } catch {
    return null;
  }
}

/**
 * Purchase cost is typed in rupees and becomes integer paise.
 *
 * `paiseFromRupeeDecimal` does the conversion with BigInt, so "12.35" can never
 * become 1234.9999 through binary floating point. There is deliberately no
 * lenient fallback: an unreadable amount is `null` and the line is refused.
 */
function parseCostInput(value: string): number | null {
  try {
    return Number(paiseFromRupeeDecimal(value.trim()));
  } catch {
    return null;
  }
}

function statusCopy(status: string): string {
  switch (status) {
    case 'draft':
      return 'Draft — not sent to the shop';
    case 'submitted':
      return 'Waiting for approval';
    case 'approved':
      return 'Approved — ready to receive';
    case 'rejected':
      return 'Rejected';
    case 'cancelled':
      return 'Cancelled';
    case 'partial':
      return 'Partly received';
    case 'received':
      return 'Fully received';
    case 'closed':
      return 'Closed';
    default:
      return status;
  }
}

export function OrdersScreen({
  read,
  draft,
  onDraftChange,
  onSaveDraft,
  onSubmit,
  onDecide,
  onCancel,
  onClose,
  onReceive,
  onOpenOrder,
  busy,
}: {
  read: PurchasingRead;
  draft: PurchasingDraft | null;
  onDraftChange: (draft: PurchasingDraft | null) => void;
  onSaveDraft: () => void;
  onSubmit: () => void;
  onDecide: (order: PurchasingOrderSummary, decision: 'approve' | 'reject') => void;
  onCancel: (order: PurchasingOrderSummary) => void;
  onClose: (order: PurchasingOrderSummary) => void;
  onReceive: (order: PurchasingOrderSummary) => void;
  onOpenOrder: (orderId: string) => void;
  busy: boolean;
}) {
  const { palette } = useTheme();
  const [query, setQuery] = useState('');
  const [catalogue, setCatalogue] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [cost, setCost] = useState('');
  const [taxBps, setTaxBps] = useState('0');
  const [notice, setNotice] = useState<string | null>(null);
  const { capabilities } = read.workspace;

  const orders = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return read.workspace.purchaseOrders.filter((order) => {
      if (needle === '') return true;
      return (
        String(order.number).includes(needle) ||
        order.supplierName.toLowerCase().includes(needle) ||
        statusCopy(order.status).toLowerCase().includes(needle)
      );
    });
  }, [read.workspace.purchaseOrders, query]);

  const products = useMemo(() => {
    const needle = catalogue.trim().toLowerCase();
    if (needle === '') return read.workspace.products.slice(0, 8);
    return read.workspace.products
      .filter(
        (product) =>
          product.name.toLowerCase().includes(needle) || product.sku.toLowerCase().includes(needle),
      )
      .slice(0, 8);
  }, [read.workspace.products, catalogue]);

  const preview = useMemo(() => {
    if (!draft) return null;
    try {
      return draftPreview(draft.lines);
    } catch {
      return null;
    }
  }, [draft]);

  const addLine = useCallback(
    (product: PurchasingProduct) => {
      if (!draft) return;
      const parsedQuantity = parseQuantityInput(quantity);
      const parsedCost = parseCostInput(cost);
      const bps = Number(taxBps.trim() === '' ? '0' : taxBps.trim());
      if (parsedQuantity === null || parsedQuantity <= 0) {
        setNotice('Enter a quantity greater than zero.');
        return;
      }
      if (parsedCost === null || parsedCost < 0) {
        setNotice('Enter the purchase cost per unit in rupees.');
        return;
      }
      if (!Number.isSafeInteger(bps) || bps < 0 || bps > 10_000) {
        setNotice('Tax rate must be between 0 and 100 percent.');
        return;
      }
      if (draft.lines.length >= 500) {
        setNotice('This order already holds the maximum number of lines.');
        return;
      }
      setNotice(null);
      onDraftChange({
        ...draft,
        lines: [
          ...draft.lines,
          { productId: product.id, quantityMilli: parsedQuantity, unitCostPaise: parsedCost, taxBps: bps },
        ],
      });
      setCatalogue('');
      setQuantity('1');
      setCost('');
      setTaxBps('0');
    },
    [draft, quantity, cost, taxBps, onDraftChange],
  );

  function removeLine(index: number) {
    if (!draft) return;
    onDraftChange({ ...draft, lines: draft.lines.filter((_, at) => at !== index) });
  }

  function nameFor(productId: string): string {
    const product = read.workspace.products.find((row) => row.id === productId);
    return product ? `${product.name} (${product.sku})` : productId;
  }

  if (!draft) {
    return (
      <ScrollView contentContainerStyle={styles.pad} testID={ids.purchaseOrders}>
        <View style={styles.block}>
          <Eyebrow>Purchase orders</Eyebrow>
          <SearchField value={query} onChange={setQuery} placeholder="Search order number, supplier or status" />
        </View>
        {orders.length === 0 ? (
          <View style={styles.block}>
            <EmptyState
              title="No purchase orders"
              detail="Open a supplier to raise the first order. Drafts never move stock or money."
            />
          </View>
        ) : (
          orders.map((order) => (
            <View key={order.id} style={styles.block}>
              <Row
                title={`Order ${order.number} · ${order.supplierName}`}
                detail={`${statusCopy(order.status)} · revision ${order.revision}`}
                meta={formatInr(parsePaise(String(order.totalPaise), false))}
                onPress={() => onOpenOrder(order.id)}
                testID={ids.purchaseOrderRow(order.id)}
              />
              <Hairline />
              <View style={styles.actions}>
                {order.status === 'submitted' && capabilities.approvePurchaseOrders ? (
                  <>
                    <ActionButton label="Approve" disabled={busy} onPress={() => onDecide(order, 'approve')} />
                    <ActionButton label="Reject" danger disabled={busy} onPress={() => onDecide(order, 'reject')} />
                  </>
                ) : null}
                {['approved', 'partial'].includes(order.status) && capabilities.receiveStock ? (
                  <ActionButton label="Receive goods" disabled={busy} onPress={() => onReceive(order)} />
                ) : null}
                {order.status === 'submitted' && capabilities.managePurchaseOrders ? (
                  <ActionButton label="Cancel" danger disabled={busy} onPress={() => onCancel(order)} />
                ) : null}
                {['approved', 'partial', 'received'].includes(order.status) && capabilities.managePurchaseOrders ? (
                  <ActionButton label="Close order" disabled={busy} onPress={() => onClose(order)} />
                ) : null}
              </View>
            </View>
          ))
        )}
      </ScrollView>
    );
  }

  const supplier = read.workspace.suppliers.find((row) => row.id === draft.supplierId);

  return (
    <ScrollView contentContainerStyle={styles.pad} testID={ids.purchaseOrderEditor}>
      <View style={styles.block}>
        <Eyebrow>{draft.orderId ? 'Editing draft order' : 'New purchase order'}</Eyebrow>
        <Title>{supplier?.name ?? draft.supplierId}</Title>
        <Muted>
          {draft.orderId
            ? `Order revision ${draft.expectedRevision ?? 0} · the hub decides if it changed`
            : 'Not saved on the hub yet. This draft moves no stock and no money.'}
        </Muted>
      </View>

      <View style={styles.block}>
        <Eyebrow>Add an item</Eyebrow>
        <SearchField value={catalogue} onChange={setCatalogue} placeholder="Search catalogue by name or SKU" />
        {products.map((product) => (
          <Row
            key={product.id}
            title={product.name}
            detail={`${product.sku} · per ${product.unit}`}
            onPress={() => addLine(product)}
          />
        ))}
        {products.length === 0 ? <Muted>No catalogue item matches. Refresh the workspace.</Muted> : null}
        <View style={styles.fields}>
          <TextInput
            accessibilityLabel="Quantity"
            value={quantity}
            onChangeText={setQuantity}
            keyboardType="decimal-pad"
            placeholder="Quantity"
            placeholderTextColor={palette.muted}
            style={[styles.field, { color: palette.ink, borderColor: palette.line }]}
          />
          <TextInput
            accessibilityLabel="Cost per unit in rupees"
            value={cost}
            onChangeText={setCost}
            keyboardType="decimal-pad"
            placeholder="Cost per unit (₹)"
            placeholderTextColor={palette.muted}
            style={[styles.field, { color: palette.ink, borderColor: palette.line }]}
          />
          <TextInput
            accessibilityLabel="Tax rate in basis points"
            value={taxBps}
            onChangeText={setTaxBps}
            keyboardType="number-pad"
            placeholder="Tax bps"
            placeholderTextColor={palette.muted}
            style={[styles.field, { color: palette.ink, borderColor: palette.line }]}
          />
        </View>
        {notice ? <Muted>{notice}</Muted> : null}
      </View>

      <View style={styles.block}>
        <Eyebrow>Lines</Eyebrow>
        {draft.lines.length === 0 ? (
          <Muted>No lines yet. Search the catalogue above and enter a quantity and cost.</Muted>
        ) : (
          draft.lines.map((line, index) => (
            <View key={`${line.productId}-${index}`}>
              <Row
                title={nameFor(line.productId)}
                detail={`${formatQuantity(parseQuantityMilli(String(line.quantityMilli)))} · ${formatInr(parsePaise(String(line.unitCostPaise), false))} each · ${line.taxBps / 100}% tax`}
                onPress={() => removeLine(index)}
                accessibilityLabel={`Remove ${nameFor(line.productId)}`}
              />
              <Hairline />
            </View>
          ))
        )}
      </View>

      {preview ? (
        <View style={styles.metrics} testID={ids.purchaseOrderPreview}>
          <Metric label="Estimate subtotal" value={formatInr(parsePaise(String(preview.subtotalPaise), false))} />
          <Metric label="Estimate tax" value={formatInr(parsePaise(String(preview.taxPaise), false))} />
          <Metric
            label="Estimate total"
            value={formatInr(parsePaise(String(preview.totalPaise), false))}
            hint="The shop hub recalculates on save"
          />
        </View>
      ) : null}

      <View style={styles.actions}>
        <ActionButton label="Save draft on this device" disabled={busy} onPress={onSaveDraft} testID={ids.purchaseOrderSaveDraft} />
        <ActionButton
          label={draft.orderId ? 'Submit changes' : 'Send to the shop'}
          disabled={busy || draft.lines.length === 0}
          onPress={onSubmit}
          testID={ids.purchaseOrderSubmit}
        />
        <ActionButton label="Discard this draft" danger disabled={busy} onPress={() => onDraftChange(null)} />
      </View>
      <Muted>
        {capabilities.approvePurchaseOrders
          ? 'Sent orders wait for your approval before any goods can be received.'
          : 'An owner or manager must approve this order before goods can be received.'}
      </Muted>
    </ScrollView>
  );
}

/** Read-only rendering of one order, its lines and its receiving history. */
export function OrderDetailBody({ lines, status }: { lines: PurchasingOrderLine[]; status: string }) {
  return (
    <View style={styles.block}>
      <Eyebrow>{statusCopy(status)}</Eyebrow>
      {lines.map((line) => (
        <View key={line.lineIndex}>
          <Row
            title={line.name}
            detail={`${formatQuantity(parseQuantityMilli(String(line.receivedMilli)))} of ${formatQuantity(parseQuantityMilli(String(line.quantityMilli)))} ${line.unit} received`}
            meta={formatInr(parsePaise(String(line.lineTotalPaise), false))}
          />
          <Hairline />
        </View>
      ))}
      <Body>
        {lines.length === 0 ? 'No lines.' : `${lines.length} line${lines.length === 1 ? '' : 's'} on this order.`}
      </Body>
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: space[20], paddingBottom: space[48] },
  block: { paddingTop: space[16], gap: space[8] },
  actions: { paddingTop: space[16], flexDirection: 'row', flexWrap: 'wrap', gap: space[8] },
  fields: { flexDirection: 'row', flexWrap: 'wrap', gap: space[8] },
  field: { minHeight: 48, minWidth: 120, flexGrow: 1, padding: 12, borderWidth: 1 },
  metrics: { paddingTop: space[16], flexDirection: 'row', flexWrap: 'wrap', gap: space[24] },
});
