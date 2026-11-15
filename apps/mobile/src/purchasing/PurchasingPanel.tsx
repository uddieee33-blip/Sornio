/**
 * The purchasing workspace: one screen that owns the client, the authoritative
 * read and the offline state, and switches between the four flows.
 *
 * Design rules enforced here:
 *  - the workspace is re-read from the hub and replaced with *its* document; a
 *    cached copy is only shown when the hub cannot be reached, and then the
 *    screen says so and shows how old it is;
 *  - every write goes through `client.submit`, which persists before transport
 *    and names its state honestly (`queued`, `unknown`, `accepted`, `refused`);
 *  - nothing is retried with a new identity. `client.recover` asks the hub about
 *    the *same* operation first.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { space } from '@sornio/mobile-design';
import { formatInr, parsePaise, paiseFromRupeeDecimal } from '@sornio/mobile-contracts';
import type { PurchasingClient, PurchasingRead } from './client';
import { MOBILE_KINDS, operationStateCopy } from './client';
import type { PurchasingOutcome } from '../../../../packages/business-domain/src/purchasing-contract';
import { refusalCopy } from '../../../../packages/business-domain/src/purchasing-contract';
import type { PurchasingDraft } from '../../../../packages/business-domain/src/purchasing-outbox';
import type { PurchasingKind } from '../../../../packages/business-domain/src/purchasing-outbox';
import { ActionButton, Body, DemoBanner, Eyebrow, Hairline, Muted, Title } from '../components/primitives';
import { ErrorState } from '../components/states';
import { useTheme } from '../theme/ThemeProvider';
import { ids } from '../testing/identifiers';
import { SuppliersScreen } from './SuppliersScreen';
import { OrdersScreen } from './OrdersScreen';
import { ReceivingScreen } from './ReceivingScreen';
import { PaymentsScreen } from './PaymentsScreen';
import { ReturnsScreen } from './ReturnsScreen';

type Tab = 'suppliers' | 'orders' | 'receiving' | 'payments' | 'returns';

const TABS: { key: Tab; label: string }[] = [
  { key: 'suppliers', label: 'Suppliers' },
  { key: 'orders', label: 'Orders' },
  { key: 'receiving', label: 'Receiving' },
  { key: 'payments', label: 'Payments' },
  { key: 'returns', label: 'Returns' },
];

/** The kind each flow raises, so the banner always names the right operation. */
const TAB_KIND: Record<Tab, PurchasingKind> = {
  suppliers: MOBILE_KINDS.supplier,
  orders: MOBILE_KINDS.draftCreated,
  receiving: MOBILE_KINDS.received,
  payments: MOBILE_KINDS.paid,
  returns: MOBILE_KINDS.returned,
};

export function PurchasingPanel({
  client,
  demo,
  onDemoOffline,
  onDemoOnline,
}: {
  client: PurchasingClient;
  demo?: boolean;
  onDemoOffline?: () => void;
  onDemoOnline?: () => void;
}) {
  const { palette } = useTheme();
  const [read, setRead] = useState<PurchasingRead | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('suppliers');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<PurchasingOutcome | null>(null);
  const [pendingFinal, setPendingFinal] = useState(false);

  const [draft, setDraft] = useState<PurchasingDraft | null>(null);
  const [supplierId, setSupplierId] = useState<string | null>(null);

  const [receiveDetail, setReceiveDetail] = useState<Awaited<ReturnType<PurchasingClient['order']>> | null>(null);
  const [receiveOrderId, setReceiveOrderId] = useState<string | null>(null);
  const [receiveReference, setReceiveReference] = useState('');
  const [receiveNote, setReceiveNote] = useState('');
  const [receivePlans, setReceivePlans] = useState<Record<number, { quantity: string; damaged: string; note: string }>>({});
  const [receiveReviewed, setReceiveReviewed] = useState(false);

  const [method, setMethod] = useState('cash');
  const [payReference, setPayReference] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [invoiceId, setInvoiceId] = useState<string | null>(null);

  const [returnQuantity, setReturnQuantity] = useState('');
  const [returnLine, setReturnLine] = useState(0);
  const [disposition, setDisposition] = useState<'supplier_credit' | 'refund'>('supplier_credit');
  const [returnReason, setReturnReason] = useState('');
  const [refundMethod, setRefundMethod] = useState('cash');

  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    try {
      const next = await client.workspace();
      if (!alive.current) return;
      setRead(next);
      setFailure(null);
      if (next.offline) {
        setNotice(`Showing the copy the shop produced at ${new Date(next.hubGeneratedAtIso).toLocaleString()}. Nothing you save is confirmed until the shop answers.`);
      }
    } catch (error) {
      if (!alive.current) return;
      setFailure(
        error instanceof Error
          ? error.message
          : 'The shop hub could not be reached and no saved copy is available.',
      );
    }
  }, [client]);

  useEffect(() => {
    void load();
  }, [load]);

  // Restore any unfinished draft and any outstanding operation on open.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const saved = await client.drafts().load();
        if (!cancelled && saved) setDraft(saved);
      } catch {
        // A draft that cannot be read is discarded, never guessed at.
      }
      try {
        const pending = await client.pending(TAB_KIND.orders);
        if (!cancelled && pending && !operationStateCopy(pending).final) {
          setNotice(operationStateCopy(pending).detail);
        }
      } catch {
        // No queued operation is the common case.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client]);

  /** Runs one write and reports exactly what the hub (or the queue) said. */
  const run = useCallback(
    async (kind: PurchasingKind, request: Record<string, unknown>, operationId?: string) => {
      if (busy) return;
      setBusy(true);
      setOutcome(null);
      setPendingFinal(false);
      try {
        const result = await client.submit(kind, request, operationId);
        const copy = operationStateCopy(result.pending);
        setNotice(copy.label + ' — ' + copy.detail);
        setPendingFinal(copy.final);
        if (result.pending.result) setOutcome(result.pending.result);
        if (copy.final) {
          await client.acknowledge(kind).catch(() => undefined);
          setPendingFinal(false);
        }
        return result.pending;
      } catch (error) {
        setNotice(
          error instanceof Error
            ? error.message
            : 'The result is unknown. Recover this same request before editing.',
        );
        return null;
      } finally {
        if (alive.current) {
          setBusy(false);
          void load();
        }
      }
    },
    [busy, client, load],
  );

  const startDraft = useCallback(
    (forSupplierId: string) => {
      setDraft({
        version: 1,
        businessId: client.identity.businessId,
        actorId: read?.workspace.actorId ?? '',
        savedAtIso: new Date().toISOString(),
        orderId: null,
        expectedRevision: null,
        supplierId: forSupplierId,
        note: '',
        lines: [],
      });
      setTab('orders');
      setNotice('New draft. Totals shown are estimates until the shop saves it.');
    },
    [client.identity.businessId, read],
  );

  const saveDraft = useCallback(async () => {
    if (!draft) return;
    try {
      const saved = await client.drafts().save(draft);
      setDraft(saved);
      setNotice('Draft saved on this device only. It is not an order yet.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The draft could not be saved on this device.');
    }
  }, [client, draft]);

  const submitOrder = useCallback(async () => {
    if (!draft || draft.lines.length === 0) return;
    const lines = draft.lines.map((line) => ({
      productId: line.productId,
      quantityMilli: line.quantityMilli,
      unitCostPaise: line.unitCostPaise,
      taxBps: line.taxBps,
    }));
    if (draft.orderId) {
      await run(MOBILE_KINDS.draftUpdated, {
        id: draft.orderId,
        expectedRevision: draft.expectedRevision ?? 0,
        note: draft.note,
        lines,
      });
    } else {
      await run(MOBILE_KINDS.draftCreated, { supplierId: draft.supplierId, note: draft.note, lines });
    }
    await client.drafts().discard().catch(() => undefined);
    setDraft(null);
  }, [client, draft, run]);

  const decide = useCallback(
    (order: { id: string; revision: number }, decision: 'approve' | 'reject') =>
      run(MOBILE_KINDS.decided, {
        id: order.id,
        expectedRevision: order.revision,
        decision,
        reason: null,
      }),
    [run],
  );

  const transition = useCallback(
    (kind: PurchasingKind) => (order: { id: string; revision: number }) =>
      run(kind, { id: order.id, expectedRevision: order.revision, reason: null }),
    [run],
  );

  const openReceiving = useCallback(
    async (orderId: string) => {
      setBusy(true);
      try {
        const detail = await client.order(orderId);
        if (!alive.current) return;
        setReceiveDetail(detail);
        setReceiveOrderId(orderId);
        setReceivePlans({});
        setReceiveReference('');
        setReceiveNote('');
        setReceiveReviewed(false);
        setTab('receiving');
      } catch (error) {
        setNotice(error instanceof Error ? error.message : 'That order could not be opened.');
      } finally {
        if (alive.current) setBusy(false);
      }
    },
    [client],
  );

  const submitReceipt = useCallback(async () => {
    if (!receiveDetail) return;
    const lines = Object.entries(receivePlans)
      .map(([index, plan]) => ({
        lineIndex: Number(index),
        productId: receiveDetail.order.lines.find((line) => line.lineIndex === Number(index))?.productId ?? '',
        quantityMilli: Number(plan.quantity || '0'),
        damagedMilli: Number(plan.damaged || '0'),
        note: plan.note,
      }))
      .filter((line) => line.quantityMilli > 0);
    await run(MOBILE_KINDS.received, {
      orderId: receiveDetail.order.id,
      reference: receiveReference.trim() === '' ? null : receiveReference.trim(),
      note: receiveNote.trim(),
      lines,
    });
    setReceiveReviewed(false);
    setReceivePlans({});
  }, [receiveDetail, receivePlans, receiveReference, receiveNote, run]);

  const submitPayment = useCallback(async () => {
    if (!supplierId) return;
    let amountPaise: number;
    try {
      amountPaise = Number(paiseFromRupeeDecimal(payAmount.trim()));
    } catch {
      setNotice('Enter the amount in rupees, for example 1250.50.');
      return;
    }
    await run(MOBILE_KINDS.paid, {
      supplierId,
      invoiceId,
      method,
      amountPaise,
      reference: payReference.trim(),
      paidOn: null,
    });
    setPayAmount('');
    setPayReference('');
    setInvoiceId(null);
  }, [supplierId, payAmount, invoiceId, method, payReference, run]);

  const submitReturn = useCallback(async () => {
    if (!receiveDetail) return;
    const receipt = receiveDetail.receipts[0];
    if (!receipt) {
      setNotice('Receive goods before returning them.');
      return;
    }
    await run(MOBILE_KINDS.returned, {
      receiptId: receipt.id,
      disposition,
      refundMethod: disposition === 'refund' ? refundMethod : null,
      reason: returnReason.trim(),
      lines: [
        {
          receiptLine: returnLine,
          productId: receipt.lines.find((line) => line.lineIndex === returnLine)?.productId ?? '',
          quantityMilli: Number(returnQuantity || '0'),
        },
      ],
    });
    setReturnQuantity('');
  }, [receiveDetail, disposition, refundMethod, returnReason, returnLine, returnQuantity, run]);

  const statement = useMemo(() => {
    const supplier = read?.workspace.suppliers.find((row) => row.id === supplierId);
    if (!supplier || !read) return null;
    const entries = read.workspace.returns
      .filter((row) => row.supplierId === supplier.id)
      .map((row) => ({ id: row.id, label: 'Return', amount: row.totalPaise, at: row.createdAt }))
      .concat(
        read.workspace.payments
          .filter((row) => row.supplierId === supplier.id)
          .map((row) => ({ id: row.id, label: `Payment · ${row.method}`, amount: -row.amountPaise, at: row.createdAt })),
      );
    return { supplier, entries };
  }, [read, supplierId]);

  if (failure && !read) {
    return <ErrorState title="Purchasing is not available" detail={failure} />;
  }
  if (!read) {
    return (
      <ScrollView contentContainerStyle={styles.pad}>
        <Title>Purchasing</Title>
        <Muted>Reading suppliers and payables from the shop hub.</Muted>
      </ScrollView>
    );
  }

  const copy = operationStateCopy(null);

  return (
    <View style={styles.root}>
      {demo ? <DemoBanner text="DEMO — this purchasing workspace is synthetic and touches no real shop." /> : null}
      <ScrollView horizontal contentContainerStyle={styles.tabs} showsHorizontalScrollIndicator={false}>
        {TABS.map((entry) => (
          <ActionButton
            key={entry.key}
            label={entry.key === tab ? `${entry.label} · open` : entry.label}
            disabled={busy}
            onPress={() => {
              setTab(entry.key);
              setNotice(null);
              setOutcome(null);
            }}
            testID={entry.key === 'suppliers' ? ids.purchaseTab : undefined}
          />
        ))}
      </ScrollView>

      <View
        style={[styles.banner, { borderColor: palette.line }]}
        accessibilityLiveRegion="polite"
        testID={ids.purchaseState}
      >
        <Muted>
          {read.offline
            ? `Offline copy · produced by the hub at ${new Date(read.hubGeneratedAtIso).toLocaleString()}`
            : `Connected · hub copy generated ${new Date(read.hubGeneratedAtIso).toLocaleTimeString()}`}
        </Muted>
        {notice ? <Body>{notice}</Body> : <Muted>{copy.detail}</Muted>}
        {outcome ? (
          <Body>
            {outcome.status === 'accepted'
              ? 'The shop committed this operation.'
              : refusalCopy(outcome.reason)}
          </Body>
        ) : null}
        {pendingFinal ? <Muted>This result is final. Open another operation when you have reviewed it.</Muted> : null}
        {demo ? (
          <View style={styles.inline}>
            <ActionButton
              label="Simulate losing the network"
              disabled={busy}
              onPress={() => {
                onDemoOffline?.();
                setNotice('The network is now unavailable. Saved work stays queued and nothing is confirmed.');
              }}
            />
            <ActionButton
              label="Restore the network"
              disabled={busy}
              onPress={() => {
                onDemoOnline?.();
                setNotice('The network is available again. Recover this same request before editing.');
                void load();
              }}
            />
            <ActionButton label="Refresh workspace" disabled={busy} onPress={() => void load()} />
          </View>
        ) : (
          <View style={styles.inline}>
            <ActionButton label="Refresh workspace" disabled={busy} onPress={() => void load()} />
          </View>
        )}
      </View>

      <View style={styles.body}>
        {tab === 'suppliers' ? (
          <SuppliersScreen
            read={read}
            onOpenOrder={(id) => {
              setSupplierId(id);
              startDraft(id);
            }}
            onOpenStatement={(id) => {
              setSupplierId(id);
              setTab('payments');
            }}
            onSave={(supplier) => {
              setNotice(
                supplier
                  ? 'Editing supplier details on a phone is not offered yet. Use the desktop workstation.'
                  : 'Adding a supplier is not offered on this phone yet. Use the desktop workstation.',
              );
            }}
          />
        ) : null}

        {tab === 'orders' ? (
          <OrdersScreen
            read={read}
            draft={draft}
            onDraftChange={setDraft}
            onSaveDraft={() => void saveDraft()}
            onSubmit={() => void submitOrder()}
            onDecide={(order, decision) => void decide(order, decision)}
            onCancel={transition(MOBILE_KINDS.cancelled)}
            onClose={transition(MOBILE_KINDS.closed)}
            onReceive={(order) => void openReceiving(order.id)}
            onOpenOrder={(orderId) => void openReceiving(orderId)}
            busy={busy}
          />
        ) : null}

        {tab === 'receiving' ? (
          receiveDetail ? (
            <ReceivingScreen
              detail={receiveDetail}
              reference={receiveReference}
              setReference={setReceiveReference}
              note={receiveNote}
              setNote={setReceiveNote}
              plans={receivePlans}
              setPlans={setReceivePlans}
              reviewed={receiveReviewed}
              onReview={() => setReceiveReviewed(true)}
              onSubmit={() => void submitReceipt()}
              busy={busy}
            />
          ) : (
            <ScrollView contentContainerStyle={styles.pad}>
              <Title>Receiving</Title>
              <Muted>Open an approved order from the Orders tab to receive it.</Muted>
            </ScrollView>
          )
        ) : null}

        {tab === 'payments' ? (
          <PaymentsScreen
            read={read}
            supplierId={supplierId}
            onSupplier={setSupplierId}
            method={method}
            setMethod={setMethod}
            reference={payReference}
            setReference={setPayReference}
            amount={payAmount}
            setAmount={setPayAmount}
            invoiceId={invoiceId}
            setInvoiceId={setInvoiceId}
            onSubmit={() => void submitPayment()}
            busy={busy}
          />
        ) : null}

        {tab === 'returns' ? (
          <ReturnsScreen
            read={read}
            detail={receiveDetail}
            quantity={returnQuantity}
            setQuantity={setReturnQuantity}
            receiptLine={returnLine}
            setReceiptLine={setReturnLine}
            disposition={disposition}
            setDisposition={setDisposition}
            reason={returnReason}
            setReason={setReturnReason}
            refundMethod={refundMethod}
            setRefundMethod={setRefundMethod}
            onSubmit={() => void submitReturn()}
            busy={busy}
          />
        ) : null}

        {tab === 'payments' && statement ? (
          <View style={styles.pad} testID={ids.purchaseStatement}>
            <Eyebrow>Statement</Eyebrow>
            <Title>{statement.supplier.name}</Title>
            <Muted>{`Balance ${formatInr(parsePaise(statement.supplier.balancePaise, true))}`}</Muted>
            {statement.entries.length === 0 ? (
              <Muted>Nothing recorded with this supplier yet.</Muted>
            ) : (
              statement.entries.map((entry) => (
                <View key={entry.id}>
                  <Muted>{`${entry.label} · ${new Date(entry.at).toLocaleDateString()}`}</Muted>
                  <Body>{formatInr(parsePaise(String(entry.amount), true))}</Body>
                  <Hairline />
                </View>
              ))
            )}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  tabs: { paddingHorizontal: space[16], paddingVertical: space[8], gap: space[8] },
  banner: { marginHorizontal: space[16], marginTop: space[8], padding: space[12], borderWidth: 1, gap: space[8] },
  body: { flex: 1, paddingTop: space[8] },
  pad: { padding: space[20], gap: space[8] },
  inline: { flexDirection: 'row', flexWrap: 'wrap', gap: space[8] },
});
