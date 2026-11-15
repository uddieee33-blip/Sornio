/**
 * Supplier payables and payments (21B-3).
 *
 * The outstanding figures come from the hub. A partial payment allocates against
 * one invoice and the hub refuses an overpayment; this screen never computes a
 * balance it then shows as authoritative. Opening balances and corrections are
 * owner-only in the native matrix and are not offered here at all when the hub
 * did not grant `correctPayables`.
 */
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { formatInr, paiseFromRupeeDecimal, parsePaise } from '@sornio/mobile-contracts';
import { space } from '@sornio/mobile-design';
import type { PurchasingRead } from './client';
import type { PurchasingInvoice, PurchasingPayment } from '../../../../packages/business-domain/src/purchasing-contract';
import { ActionButton, Body, Eyebrow, Hairline, Metric, Muted, Row, Title } from '../components/primitives';
import { EmptyState } from '../components/primitives';
import { useTheme } from '../theme/ThemeProvider';
import { ids } from '../testing/identifiers';

/** The payment methods the native posting path accepts. */
const METHODS = ['cash', 'upi', 'bank', 'cheque'] as const;

function invoiceLabel(invoice: PurchasingInvoice): string {
  const due = invoice.dueOn ? `due ${invoice.dueOn}` : 'no due date';
  return `${invoice.reference || invoice.id} · ${due}`;
}

export function PaymentsScreen({
  read,
  supplierId,
  onSupplier,
  method,
  setMethod,
  reference,
  setReference,
  amount,
  setAmount,
  invoiceId,
  setInvoiceId,
  onSubmit,
  busy,
}: {
  read: PurchasingRead;
  supplierId: string | null;
  onSupplier: (supplierId: string) => void;
  method: string;
  setMethod: (value: string) => void;
  reference: string;
  setReference: (value: string) => void;
  amount: string;
  setAmount: (value: string) => void;
  invoiceId: string | null;
  setInvoiceId: (value: string | null) => void;
  onSubmit: () => void;
  busy: boolean;
}) {
  const { palette } = useTheme();
  const [error, setError] = useState<string | null>(null);
  const { capabilities } = read.workspace;

  const suppliers = useMemo(
    () => read.workspace.suppliers.filter((supplier) => !supplier.archived),
    [read.workspace.suppliers],
  );
  const supplier = suppliers.find((row) => row.id === supplierId) ?? suppliers[0] ?? null;
  const invoices = supplier
    ? read.workspace.invoices.filter((invoice) => invoice.supplierId === supplier.id && invoice.outstandingPaise > 0)
    : [];
  const payments = supplier
    ? read.workspace.payments.filter((payment) => payment.supplierId === supplier.id)
    : [];
  const selectedInvoice = invoices.find((invoice) => invoice.id === invoiceId) ?? null;

  const parsedAmount = useMemo(() => {
    try {
      return Number(paiseFromRupeeDecimal(amount.trim()));
    } catch {
      return null;
    }
  }, [amount]);

  function submit() {
    if (parsedAmount === null || parsedAmount <= 0) {
      setError('Enter the amount paid in rupees, for example 1250.50.');
      return;
    }
    if (reference.trim() === '') {
      setError('Record the payment reference so the statement can be traced.');
      return;
    }
    if (selectedInvoice && parsedAmount > selectedInvoice.outstandingPaise) {
      setError('That is more than this invoice still owes. Reduce it or pay the whole invoice.');
      return;
    }
    setError(null);
    onSubmit();
  }

  if (!supplier) {
    return (
      <ScrollView contentContainerStyle={styles.pad} testID={ids.purchasePayments}>
        <EmptyState title="No suppliers" detail="Add a supplier before recording a payment." />
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.pad} testID={ids.purchasePayments}>
      <View style={styles.block}>
        <Eyebrow>Supplier payments</Eyebrow>
        <Title>{supplier.name}</Title>
        <Muted>
          {`Balance ${formatInr(parsePaise(supplier.balancePaise, true))} · ${invoices.length} invoice${invoices.length === 1 ? '' : 's'} outstanding`}
        </Muted>
      </View>

      <View style={styles.actions}>
        {suppliers.slice(0, 6).map((row) => (
          <ActionButton key={row.id} label={row.name} disabled={busy} onPress={() => onSupplier(row.id)} />
        ))}
      </View>

      <View style={styles.block}>
        <Eyebrow>Outstanding invoices</Eyebrow>
        {invoices.length === 0 ? (
          <Muted>Nothing outstanding for this supplier.</Muted>
        ) : (
          invoices.map((invoice) => (
            <View key={invoice.id}>
              <Row
                title={invoice.reference || invoice.id}
                detail={`${invoiceLabel(invoice)}${invoiceId === invoice.id ? ' · selected' : ''}`}
                meta={formatInr(parsePaise(String(invoice.outstandingPaise), false))}
                onPress={() => {
                  setInvoiceId(invoice.id === invoiceId ? null : invoice.id);
                  setAmount(String(invoice.outstandingPaise / 100));
                }}
              />
              <Hairline />
            </View>
          ))
        )}
      </View>

      {capabilities.paySuppliers ? (
        <View style={styles.block}>
          <Eyebrow>Record a payment</Eyebrow>
          <Muted>
            {selectedInvoice
              ? `Allocating against ${selectedInvoice.reference || selectedInvoice.id}.`
              : 'No invoice selected — this is a payment on account.'}
          </Muted>
          <View style={styles.fields}>
            <TextInput
              accessibilityLabel="Amount paid in rupees"
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholder="Amount (₹)"
              placeholderTextColor={palette.muted}
              editable={!busy}
              style={[styles.field, { color: palette.ink, borderColor: palette.line }]}
            />
            <TextInput
              accessibilityLabel="Payment reference"
              value={reference}
              onChangeText={setReference}
              placeholder="Reference"
              placeholderTextColor={palette.muted}
              editable={!busy}
              style={[styles.field, { color: palette.ink, borderColor: palette.line }]}
            />
          </View>
          <View style={styles.actions}>
            {METHODS.map((value) => (
              <ActionButton
                key={value}
                label={value === method ? `${value} · selected` : value}
                disabled={busy}
                onPress={() => setMethod(value)}
              />
            ))}
          </View>
          {error ? <Muted>{error}</Muted> : null}
          <ActionButton label="Record payment" disabled={busy} onPress={submit} testID={ids.purchasePaySubmit} />
        </View>
      ) : (
        <View style={styles.block}>
          <Body>Recording supplier payments needs the owner or a manager.</Body>
          <Muted>You can still read the invoices and statement above.</Muted>
        </View>
      )}

      <View style={styles.metrics}>
        <Metric label="Invoices" value={String(read.workspace.invoices.length)} />
        <Metric label="Payments" value={String(read.workspace.payments.length)} />
        <Metric label="Returns" value={String(read.workspace.returns.length)} />
      </View>

      <View style={styles.block}>
        <Eyebrow>Recent payments</Eyebrow>
        {payments.length === 0 ? (
          <Muted>No payments recorded with this supplier.</Muted>
        ) : (
          payments.slice(0, 10).map((payment: PurchasingPayment) => (
            <Row
              key={payment.id}
              title={`${payment.method} · ${payment.reference || 'no reference'}`}
              detail={payment.invoiceId ? `Against ${payment.invoiceId}` : 'On account'}
              meta={formatInr(parsePaise(String(payment.amountPaise), false))}
            />
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: space[20], paddingBottom: space[48] },
  block: { paddingTop: space[16], gap: space[8] },
  fields: { flexDirection: 'row', flexWrap: 'wrap', gap: space[8] },
  field: { minHeight: 48, minWidth: 120, flexGrow: 1, padding: 12, borderWidth: 1 },
  actions: { paddingTop: space[16], flexDirection: 'row', flexWrap: 'wrap', gap: space[8] },
  metrics: { paddingTop: space[16], flexDirection: 'row', flexWrap: 'wrap', gap: space[24] },
});
