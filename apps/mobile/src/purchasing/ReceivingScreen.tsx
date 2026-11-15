/**
 * Goods receiving (21B-3).
 *
 * The quantities the person types are *plans*, shown as an estimate. The hub
 * compares them with what the order still owes it and decides; over-receipt,
 * damaged-over-quantity and stale revisions are refused there, never here.
 *
 * Ordered / previously received / already damaged are all shown from the hub's
 * own numbers so a person can see what is left before typing anything.
 */
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { formatQuantity, parseQuantityMilli, quantityFromDecimal } from '@sornio/mobile-contracts';
import { space } from '@sornio/mobile-design';
import type { PurchasingOrderDetail, PurchasingOrderLine } from '../../../../packages/business-domain/src/purchasing-contract';
import { ActionButton, Body, Eyebrow, Hairline, Muted, Row, Title } from '../components/primitives';
import { useTheme } from '../theme/ThemeProvider';
import { ids } from '../testing/identifiers';

type Plan = { quantity: string; damaged: string; note: string };

function millis(value: string): number | null {
  try {
    return Number(parseQuantityMilli(quantityFromDecimal(value.trim() === '' ? '0' : value.trim())));
  } catch {
    return null;
  }
}

function quantityLabel(value: number): string {
  return formatQuantity(parseQuantityMilli(String(value)));
}

export function ReceivingScreen({
  detail,
  reference,
  setReference,
  note,
  setNote,
  plans,
  setPlans,
  reviewed,
  onReview,
  onSubmit,
  busy,
}: {
  detail: PurchasingOrderDetail;
  reference: string;
  setReference: (value: string) => void;
  note: string;
  setNote: (value: string) => void;
  plans: Record<number, Plan>;
  setPlans: (value: Record<number, Plan>) => void;
  reviewed: boolean;
  onReview: () => void;
  onSubmit: () => void;
  busy: boolean;
}) {
  const { palette } = useTheme();
  const [error, setError] = useState<string | null>(null);
  const { order } = detail;

  function planFor(line: PurchasingOrderLine): Plan {
    return plans[line.lineIndex] ?? { quantity: '', damaged: '0', note: '' };
  }

  function update(line: PurchasingOrderLine, patch: Partial<Plan>) {
    setPlans({ ...plans, [line.lineIndex]: { ...planFor(line), ...patch } });
  }

  /** What this form is about to hand the hub, in the hub's own units. */
  const prepared = useMemo(() => {
    const out: { lineIndex: number; productId: string; quantityMilli: number; damagedMilli: number; note: string }[] = [];
    for (const line of order.lines) {
      const plan = plans[line.lineIndex];
      if (!plan || plan.quantity.trim() === '') continue;
      const quantity = millis(plan.quantity);
      const damaged = millis(plan.damaged);
      if (quantity === null || damaged === null) return { error: 'A quantity is not a number.', lines: [] };
      if (quantity <= 0) continue;
      out.push({
        lineIndex: line.lineIndex,
        productId: line.productId,
        quantityMilli: quantity,
        damagedMilli: damaged,
        note: plan.note.trim(),
      });
    }
    return { error: null as string | null, lines: out };
  }, [order.lines, plans]);

  const totalUnits = prepared.lines.reduce((sum, line) => sum + line.quantityMilli, 0);
  const damagedUnits = prepared.lines.reduce((sum, line) => sum + line.damagedMilli, 0);

  function review() {
    const over = prepared.lines.find((line) => {
      const ordered = order.lines.find((row) => row.lineIndex === line.lineIndex);
      if (!ordered) return true;
      const remaining = ordered.quantityMilli - ordered.receivedMilli;
      return line.quantityMilli > remaining || line.damagedMilli > line.quantityMilli || line.damagedMilli < 0;
    });
    if (prepared.error) return setError(prepared.error);
    if (prepared.lines.length === 0) return setError('Enter the quantity that actually arrived.');
    if (over) return setError('A quantity is more than this order still owes, or damage is larger than the delivery.');
    setError(null);
    onReview();
  }

  return (
    <ScrollView contentContainerStyle={styles.pad} testID={ids.purchaseReceiving}>
      <View style={styles.block}>
        <Eyebrow>Receive goods</Eyebrow>
        <Title>{`Order ${order.number} · ${order.supplierName}`}</Title>
        <Muted>{`Status ${order.status} · revision ${order.revision} · receiving is committed and cannot be edited afterwards`}</Muted>
      </View>

      {order.lines.map((line) => {
        const plan = planFor(line);
        const remaining = line.quantityMilli - line.receivedMilli;
        return (
          <View key={line.lineIndex} style={styles.block}>
            <Row
              title={line.name}
              detail={`Ordered ${quantityLabel(line.quantityMilli)} · already received ${quantityLabel(line.receivedMilli)} · still due ${quantityLabel(Math.max(0, remaining))} ${line.unit}`}
            />
            <View style={styles.fields}>
              <TextInput
                accessibilityLabel={`Received quantity for ${line.name}`}
                value={plan.quantity}
                onChangeText={(value) => update(line, { quantity: value })}
                keyboardType="decimal-pad"
                placeholder="Received"
                placeholderTextColor={palette.muted}
                editable={!busy && remaining > 0}
                style={[styles.field, { color: palette.ink, borderColor: palette.line }]}
              />
              <TextInput
                accessibilityLabel={`Damaged quantity for ${line.name}`}
                value={plan.damaged}
                onChangeText={(value) => update(line, { damaged: value })}
                keyboardType="decimal-pad"
                placeholder="Damaged"
                placeholderTextColor={palette.muted}
                editable={!busy && remaining > 0}
                style={[styles.field, { color: palette.ink, borderColor: palette.line }]}
              />
            </View>
            <TextInput
              accessibilityLabel={`Note for ${line.name}`}
              value={plan.note}
              onChangeText={(value) => update(line, { note: value })}
              placeholder="Note (optional)"
              placeholderTextColor={palette.muted}
              editable={!busy}
              style={[styles.field, { color: palette.ink, borderColor: palette.line }]}
            />
          </View>
        );
      })}

      <View style={styles.block}>
        <Eyebrow>Delivery</Eyebrow>
        <TextInput
          accessibilityLabel="Supplier challan or invoice reference"
          value={reference}
          onChangeText={setReference}
          placeholder="Challan or invoice reference"
          placeholderTextColor={palette.muted}
          editable={!busy}
          style={[styles.field, { color: palette.ink, borderColor: palette.line }]}
        />
        <TextInput
          accessibilityLabel="Delivery note"
          value={note}
          onChangeText={setNote}
          placeholder="Note (optional)"
          placeholderTextColor={palette.muted}
          editable={!busy}
          style={[styles.field, { color: palette.ink, borderColor: palette.line }]}
        />
      </View>

      <View style={styles.block}>
        <Body>
          {prepared.lines.length === 0
            ? 'Nothing entered yet.'
            : `${quantityLabel(totalUnits)} arriving, of which ${quantityLabel(damagedUnits)} damaged. Only the good units are added to stock.`}
        </Body>
        {error ? <Muted>{error}</Muted> : null}
      </View>

      <View style={styles.actions}>
        <ActionButton
          label={reviewed ? 'Reviewed — submission ready' : 'Review this receipt'}
          disabled={busy}
          onPress={review}
          testID={ids.purchaseReceiveReview}
        />
        <ActionButton
          label="Submit receipt to the shop"
          disabled={busy || !reviewed || prepared.lines.length === 0}
          onPress={onSubmit}
          testID={ids.purchaseReceiveSubmit}
        />
      </View>
      <Muted>
        Damaged units are recorded against the delivery and are not added to sellable stock. Submitting twice
        reuses the same operation and never posts a second receipt.
      </Muted>
      <Hairline />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: space[20], paddingBottom: space[48] },
  block: { paddingTop: space[16], gap: space[8] },
  fields: { flexDirection: 'row', flexWrap: 'wrap', gap: space[8] },
  field: { minHeight: 48, minWidth: 120, flexGrow: 1, padding: 12, borderWidth: 1 },
  actions: { paddingTop: space[16], flexDirection: 'row', flexWrap: 'wrap', gap: space[8] },
});
