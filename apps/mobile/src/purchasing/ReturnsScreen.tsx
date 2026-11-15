/**
 * Supplier returns (21B-3).
 *
 * A return is against a *received* delivery: returnable quantity is what was
 * received minus what arrived damaged minus what was already returned. The hub
 * enforces that; this screen shows it so a person does not have to guess, and
 * states the expected effect before anything is committed.
 */
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { formatQuantity, formatInr, parsePaise, parseQuantityMilli, quantityFromDecimal } from '@sornio/mobile-contracts';
import { space } from '@sornio/mobile-design';
import type { PurchasingRead } from './client';
import type { PurchasingReceiptDetail } from '../../../../packages/business-domain/src/purchasing-contract';
import { ActionButton, Body, Eyebrow, Hairline, Metric, Muted, Row, Title } from '../components/primitives';
import { EmptyState } from '../components/primitives';
import { useTheme } from '../theme/ThemeProvider';
import { ids } from '../testing/identifiers';

type Disposition = 'supplier_credit' | 'refund';

function quantityLabel(value: number): string {
  return formatQuantity(parseQuantityMilli(String(value)));
}

export function ReturnsScreen({
  read,
  detail,
  quantity,
  setQuantity,
  receiptLine,
  setReceiptLine,
  disposition,
  setDisposition,
  reason,
  setReason,
  refundMethod,
  setRefundMethod,
  onSubmit,
  busy,
}: {
  read: PurchasingRead;
  detail: PurchasingOrderDetailLike | null;
  quantity: string;
  setQuantity: (value: string) => void;
  receiptLine: number;
  setReceiptLine: (value: number) => void;
  disposition: Disposition;
  setDisposition: (value: Disposition) => void;
  reason: string;
  setReason: (value: string) => void;
  refundMethod: string;
  setRefundMethod: (value: string) => void;
  onSubmit: () => void;
  busy: boolean;
}) {
  const { palette } = useTheme();
  const [error, setError] = useState<string | null>(null);
  const { capabilities } = read.workspace;

  const receipts = read.workspace.receipts;

  // A return is always against the *latest* delivery of the open order, which is
  // the one the receiving screen just committed.
  const receipt: PurchasingReceiptDetail | null = detail?.receipts[detail.receipts.length - 1] ?? null;
  const line = receipt?.lines.find((row) => row.lineIndex === receiptLine) ?? receipt?.lines[0] ?? null;

  /** Returned totals this receipt has already consumed, per line. */
  const alreadyReturned = useMemo(() => {
    if (!receipt) return 0;
    return read.workspace.returns
      .filter((row) => row.receiptId === receipt.id)
      .reduce((sum, row) => sum + row.totalPaise, 0);
  }, [receipt, read.workspace.returns]);

  const parsedQuantity = useMemo(() => {
    try {
      return Number(parseQuantityMilli(quantityFromDecimal(quantity.trim() === '' ? '0' : quantity.trim())));
    } catch {
      return null;
    }
  }, [quantity]);

  const returnable = line ? line.quantityMilli - line.damagedMilli : 0;
  const expectedValue = line && parsedQuantity ? Math.floor((parsedQuantity * line.unitCostPaise + 500) / 1000) : 0;

  function submit() {
    if (!receipt || !line) return setError('Open a received delivery first.');
    if (parsedQuantity === null || parsedQuantity <= 0) return setError('Enter how many units are going back.');
    if (parsedQuantity > returnable) {
      return setError(
        `Only ${quantityLabel(returnable)} of this line is returnable: ${quantityLabel(line.quantityMilli)} arrived and ${quantityLabel(line.damagedMilli)} was damaged.`,
      );
    }
    if (reason.trim() === '') return setError('State why the goods are going back.');
    if (disposition === 'refund' && refundMethod.trim() === '') {
      return setError('Choose how the refund is paid back.');
    }
    setError(null);
    onSubmit();
  }

  if (!capabilities.refund) {
    return (
      <ScrollView contentContainerStyle={styles.pad} testID={ids.purchaseReturns}>
        <View style={styles.block}>
          <Title>Supplier returns</Title>
          <Body>Recording a supplier return needs the owner or a manager.</Body>
          <Muted>
            {read.workspace.returns.length === 0
              ? 'No returns have been recorded with any supplier.'
              : `${read.workspace.returns.length} return${read.workspace.returns.length === 1 ? '' : 's'} are already recorded.`}
          </Muted>
        </View>
        {read.workspace.returns.map((row) => (
          <View key={row.id} style={styles.block}>
            <Row
              title={row.disposition === 'refund' ? 'Refunded' : 'Supplier credit'}
              detail={`${row.reason} · receipt ${row.receiptId}`}
              meta={formatInr(parsePaise(String(row.totalPaise), false))}
            />
            <Hairline />
          </View>
        ))}
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.pad} testID={ids.purchaseReturns}>
      <View style={styles.block}>
        <Eyebrow>Supplier return</Eyebrow>
        <Title>{receipt ? `Delivery ${receipt.orderNumber}` : 'No delivery selected'}</Title>
        <Muted>
          {receipt
            ? `${read.workspace.receipts.length} deliveries on this hub · ${formatInr(parsePaise(String(alreadyReturned), false))} already returned against this one`
            : 'Receive goods first; a return is always against a received delivery.'}
        </Muted>
      </View>

      {receipts.length === 0 ? (
        <EmptyState title="Nothing to return" detail="No delivery has been received on this hub yet." />
      ) : null}

      {receipt ? (
        <>
          <View style={styles.block}>
            <Eyebrow>Choose the line</Eyebrow>
            {receipt.lines.map((row) => (
              <View key={row.lineIndex}>
                <Row
                  title={`Line ${row.lineIndex + 1}`}
                  detail={`${quantityLabel(row.quantityMilli)} received · ${quantityLabel(row.damagedMilli)} damaged · ${quantityLabel(row.quantityMilli - row.damagedMilli)} returnable`}
                  onPress={() => setReceiptLine(row.lineIndex)}
                  accessibilityLabel={`Return line ${row.lineIndex + 1}`}
                />
                <Hairline />
              </View>
            ))}
          </View>

          <View style={styles.block}>
            <Eyebrow>Return details</Eyebrow>
            <TextInput
              accessibilityLabel="Quantity to return"
              value={quantity}
              onChangeText={setQuantity}
              keyboardType="decimal-pad"
              placeholder="Quantity"
              placeholderTextColor={palette.muted}
              editable={!busy}
              style={[styles.field, { color: palette.ink, borderColor: palette.line }]}
            />
            <TextInput
              accessibilityLabel="Reason for the return"
              value={reason}
              onChangeText={setReason}
              placeholder="Reason"
              placeholderTextColor={palette.muted}
              editable={!busy}
              style={[styles.field, { color: palette.ink, borderColor: palette.line }]}
            />
            <View style={styles.actions}>
              <ActionButton
                label={disposition === 'supplier_credit' ? 'Supplier credit · selected' : 'Supplier credit'}
                disabled={busy}
                onPress={() => setDisposition('supplier_credit')}
              />
              <ActionButton
                label={disposition === 'refund' ? 'Refund · selected' : 'Refund'}
                disabled={busy}
                onPress={() => setDisposition('refund')}
              />
            </View>
            {disposition === 'refund' ? (
              <View style={styles.actions}>
                {['cash', 'upi', 'bank'].map((value) => (
                  <ActionButton
                    key={value}
                    label={value === refundMethod ? `${value} · selected` : value}
                    disabled={busy}
                    onPress={() => setRefundMethod(value)}
                  />
                ))}
              </View>
            ) : null}
          </View>

          <View style={styles.metrics}>
            <Metric label="Returnable" value={quantityLabel(returnable)} hint="Good units on this line" />
            <Metric label="Expected credit" value={formatInr(parsePaise(String(expectedValue), false))} hint="Estimate; the hub posts the entry" />
          </View>
          <Body>
            {disposition === 'supplier_credit'
              ? 'Expected effect: the supplier balance drops by the returned value. Stock leaves the shelf as a return, not a sale.'
              : 'Expected effect: the supplier balance drops and the refund is recorded against the chosen method.'}
          </Body>
          {error ? <Muted>{error}</Muted> : null}
          <View style={styles.actions}>
            <ActionButton label="Submit return" disabled={busy} onPress={submit} testID={ids.purchaseReturnSubmit} />
          </View>
          <Muted>
            A return cannot exceed what was received and is never silently edited afterwards. A reversal is a separate
            authorised entry.
          </Muted>
        </>
      ) : null}

      <View style={styles.block}>
        <Eyebrow>Return history</Eyebrow>
        {read.workspace.returns.length === 0 ? (
          <Muted>No returns recorded yet.</Muted>
        ) : (
          read.workspace.returns.map((row) => (
            <Row
              key={row.id}
              title={row.disposition === 'refund' ? 'Refund' : 'Supplier credit'}
              detail={`${row.reason} · receipt ${row.receiptId}`}
              meta={formatInr(parsePaise(String(row.totalPaise), false))}
            />
          ))
        )}
      </View>
    </ScrollView>
  );
}

type PurchasingOrderDetailLike = {
  receipts: PurchasingReceiptDetail[];
};

const styles = StyleSheet.create({
  pad: { paddingHorizontal: space[20], paddingBottom: space[48] },
  block: { paddingTop: space[16], gap: space[8] },
  field: { minHeight: 48, padding: 12, borderWidth: 1 },
  actions: { paddingTop: space[8], flexDirection: 'row', flexWrap: 'wrap', gap: space[8] },
  metrics: { paddingTop: space[16], flexDirection: 'row', flexWrap: 'wrap', gap: space[24] },
});
