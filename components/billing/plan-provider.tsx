'use client';

/**
 * PlanProvider — what this console believes about the plan, and how it changes.
 *
 * Responsibilities, and deliberately nothing else:
 *
 *   1. Read the signed plan cookie from the server on mount and turn it into an
 *      **entitlement** with the same pure function middleware uses, so the
 *      console and the edge can never disagree about what is unlocked.
 *   2. Publish that entitlement to `lib/plans/active.ts`, where the store's
 *      collection gate reads it synchronously at the moment money is recorded.
 *   3. Expose the three actions an owner can take (`startTrial`, `choosePlan`,
 *      `requestActivation`, `activate`) with honest pending/error states.
 *
 * It never grants anything. A plan only changes when the server says so — this
 * provider is a view of the answer, not the answer.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useDukaanStore } from '@/lib/store';
import {
  describeState,
  planById,
  resolveEntitlement,
  summarizeUsage,
  type Entitlement,
  type PaidPlanId,
  type PlanRecord,
  type UsageSummary,
} from '@/lib/plans';
import { setActivePlanRecord } from '@/lib/plans/active';
import { useNow } from '@/lib/perf/clock';
import { fetchPlan, postPlan, type PaymentInstructions } from '@/lib/plans/client';

export type PlanNotice = { tone: 'ok' | 'error' | 'info'; text: string } | null;

type PlanContextValue = {
  entitlement: Entitlement;
  /** Where the console stands in one sentence, in the owner's words. */
  statusLine: string;
  usage: UsageSummary;
  loading: boolean;
  busy: boolean;
  notice: PlanNotice;
  dismissNotice: () => void;
  payment: PaymentInstructions | null;
  /** Set once the server has answered at least once (offline-safe UI). */
  synced: boolean;
  startTrial: () => Promise<boolean>;
  choosePlan: (planId: 'starter') => Promise<boolean>;
  requestActivation: (planId: PaidPlanId, interval: string) => Promise<boolean>;
  activate: (code: string) => Promise<boolean>;
  refresh: () => Promise<void>;
};

const PlanContext = createContext<PlanContextValue | null>(null);

export function PlanProvider({ children }: { children: ReactNode }) {
  const { state, actions } = useDukaanStore();
  const [record, setRecord] = useState<PlanRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [synced, setSynced] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<PlanNotice>(null);
  const [payment, setPayment] = useState<PaymentInstructions | null>(null);

  // The wall clock is external mutable state: it is read through a ticking
  // store (never during render), so render stays pure and hydration is stable.
  // Until the first tick the console holds the free entitlement — the safe
  // direction, never the generous one.
  const now = useNow(60_000);
  const timezone = state.profile.timezone || 'Asia/Kolkata';
  const entitlement = useMemo(
    () => (now > 0 ? resolveEntitlement(record, now) : resolveEntitlement(null, 0)),
    [record, now],
  );

  // Publish to the synchronous gate the store reads (lib/plans/active.ts).
  useEffect(() => {
    if (now <= 0) return;
    setActivePlanRecord(record, now);
  }, [record, now]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await fetchPlan();
      if (cancelled) return;
      if (result.ok) {
        setRecord(result.record ?? null);
        setSynced(true);
      }
      // A failed read is not an error the owner needs: the console simply keeps
      // the free entitlement the gate already defaults to, and the page says so.
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const run = useCallback(
    async (
      work: () => Promise<{ ok: boolean; error?: string; record?: PlanRecord | null; payment?: PaymentInstructions; }>,
      successText: (record: PlanRecord | null) => string,
    ): Promise<boolean> => {
      setBusy(true);
      setNotice(null);
      const result = await work();
      setBusy(false);
      if (!result.ok) {
        setNotice({ tone: 'error', text: result.error ?? 'That did not work. Try again.' });
        return false;
      }
      if (result.record !== undefined) {
        setRecord(result.record ?? null);
        setSynced(true);
      }
      if (result.payment) setPayment(result.payment);
      setNotice({ tone: 'ok', text: successText(result.record ?? null) });
      return true;
    },
    [],
  );

  const startTrial = useCallback(
    () =>
      run(
        () => postPlan({ action: 'start-trial' }),
        () => `Trial started — every module is unlocked for the next 3 days.`,
      ),
    [run],
  );

  const choosePlan = useCallback(
    (planId: 'starter') =>
      run(
        () => postPlan({ action: 'choose-plan', planId }),
        () => 'You are on the free plan. Nothing you recorded was touched.',
      ),
    [run],
  );

  const requestActivation = useCallback(
    (planId: PaidPlanId, interval: string) =>
      run(
        () => postPlan({ action: 'request-activation', planId, interval }),
        () => 'Payment details are below. Your plan switches on the moment the code is entered.',
      ),
    [run],
  );

  const activate = useCallback(
    (code: string) =>
      run(
        () => postPlan({ action: 'activate', code }),
        () => 'Payment confirmed — your paid plan is on. Thank you.',
      ),
    [run],
  );

  const refresh = useCallback(async () => {
    const result = await fetchPlan();
    if (result.ok) {
      setRecord(result.record ?? null);
      setSynced(true);
    }
  }, []);

  const usage = useMemo(
    () => summarizeUsage(state.transactions, entitlement, { timeZone: timezone }),
    [state.transactions, entitlement, timezone],
  );

  // The one sentence the console says about money, said the same way everywhere.
  const statusLine = useMemo(() => {
    const base = describeState(entitlement);
    if (entitlement.state === 'free' && usage.allowance !== null) {
      const left = Math.max(usage.allowance - usage.upiCollections, 0);
      return `${base} ${left} of ${usage.allowance} UPI collections left this month.`;
    }
    return base;
  }, [entitlement, usage]);

  // A lapsed or trial-less console logs it once, so the audit trail explains
  // later why a module disappeared — traceability applies to us too.
  useEffect(() => {
    if (loading) return;
    if (entitlement.state !== 'expired') return;
    const lapsed = entitlement.lapsedFrom;
    actions.recordPlanEvent(
      lapsed === 'trial'
        ? 'Free trial ended — console moved to the free plan, paid automations paused. No records were removed.'
        : lapsed
          ? `${planById(lapsed).name} period ended — console moved to the free plan, paid automations paused. No records were removed.`
          : 'Paid period ended — console moved to the free plan, paid automations paused. No records were removed.',
    );
    // Only when the state flips, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entitlement.state, loading]);

  const value = useMemo<PlanContextValue>(
    () => ({
      entitlement,
      statusLine,
      usage,
      loading,
      busy,
      notice,
      dismissNotice: () => setNotice(null),
      payment,
      synced,
      startTrial,
      choosePlan,
      requestActivation,
      activate,
      refresh,
    }),
    [entitlement, statusLine, usage, loading, busy, notice, payment, synced, startTrial, choosePlan, requestActivation, activate, refresh],
  );

  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>;
}

export function usePlan(): PlanContextValue {
  const context = useContext(PlanContext);
  if (!context) throw new Error('usePlan must be used inside PlanProvider');
  return context;
}
