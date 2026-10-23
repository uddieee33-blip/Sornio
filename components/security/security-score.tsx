'use client';

/**
 * The security score — the Trust Centre's front page.
 *
 * This is the one screen that answers the question an owner actually has:
 * *is my shop safe right now?* Everything below it on the Trust Centre
 * explains the machinery; this says whether the machinery is switched on.
 *
 * It is built to resist the two failure modes of every security dashboard:
 *
 *   - **The vanity score.** A number that only ever goes up, computed from
 *     things we control, is a logo. Every check here reads live browser state
 *     (`isSecureContext`, `document.cookie`, `crossOriginIsolated`) or live
 *     app state (the hash chain, re-verified on mount), and a check this
 *     browser cannot answer is excluded from the denominator rather than
 *     counted green. See `lib/security/posture.ts`.
 *   - **The wall of green.** Nine ticks teach an owner to stop reading. The
 *     gaps are pulled to the top with the fix stated in one line, and the
 *     passes collapse behind a disclosure — because the useful information on
 *     a healthy day is "nothing to do", not nine paragraphs.
 */

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Fingerprint,
  HelpCircle,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { Card, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Ring } from '@/components/ui/Ring';
import { AnimatedNumber } from '@/components/motion/animated-number';
import { useDukaanStore } from '@/lib/store';
import { usePortal } from '@/lib/portals/portal-provider';
import { useAppearance } from '@/lib/theme/appearance-provider';
import { useCounterLock } from '@/components/security/counter-lock';
import { toChainEvent, verifyChain } from '@/lib/security/audit';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import {
  GROUP_LABELS,
  buildPostureReport,
  readBrowserFacts,
  type BrowserFacts,
  type CheckState,
  type PostureCheck,
} from '@/lib/security/posture';
import {
  enrollPasskey,
  forgetPasskey,
  hasPlatformAuthenticator,
  passkeyServerSnapshot,
  passkeySnapshot,
  passkeySupport,
  subscribePasskey,
} from '@/lib/security/passkey';
import { useToast } from '@/lib/ui/toast';

const STATE_TONE: Record<CheckState, BadgeTone> = {
  pass: 'emerald',
  warn: 'amber',
  fail: 'red',
  unknown: 'slate',
};

const STATE_LABEL: Record<CheckState, string> = {
  pass: 'On',
  warn: 'Weak',
  fail: 'Off',
  unknown: 'Unknown',
};

function StateIcon({ state }: { state: CheckState }) {
  if (state === 'pass') return <CheckCircle2 size={16} className="text-emerald-600" />;
  if (state === 'warn') return <AlertTriangle size={16} className="text-amber-600" />;
  if (state === 'fail') return <ShieldAlert size={16} className="text-red-600" />;
  return <HelpCircle size={16} className="text-stone-500" />;
}

function CheckRow({ check }: { check: PostureCheck }) {
  return (
    <div className="flex items-start gap-3 rounded-xl bg-lift p-3 ring-1 ring-inset ring-stone-200/70">
      <span className="mt-0.5 shrink-0">
        <StateIcon state={check.state} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-stone-900">{check.title}</p>
          <Badge tone={STATE_TONE[check.state]}>{STATE_LABEL[check.state]}</Badge>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-stone-600">{check.evidence}</p>
        {check.action ? (
          <p className="mt-1.5 text-xs font-medium leading-relaxed text-stone-800">→ {check.action}</p>
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ report */

type ViolationSummary = { total: number; kinds: { kind: string; count: number }[] } | null;

/**
 * Re-hash the audit chain and report whether it still links up.
 *
 * Pure: it takes entries and returns a verdict, with no knowledge of React.
 * That is what lets the caller await it from inside an effect without the
 * component's state updates becoming synchronous work.
 */
async function verifyAuditChain(audit: ReturnType<typeof useDukaanStore>['state']['audit']): Promise<boolean> {
  try {
    const events = audit.map((entry) =>
      toChainEvent({
        id: entry.id,
        createdAt: entry.createdAt,
        type: entry.type,
        summary: entry.summary,
        severity: entry.severity,
        action: entry.action,
        actor: entry.actor,
        actorId: entry.actorId,
        actorRole: entry.actorRole,
        meta: entry.meta,
        prev: entry.prev,
        hash: entry.hash,
      }),
    );
    const result = await verifyChain(events);
    return result.valid;
  } catch {
    return false;
  }
}

export function SecurityScore() {
  const { state, hydrated, persistence, syncStatus } = useDukaanStore();
  const { revealAll } = usePortal();
  const { appearance } = useAppearance();
  const lock = useCounterLock();
  const toast = useToast();

  const [chainResult, setChainResult] = useState<{
    audit: typeof state.audit;
    refresh: number;
    valid: boolean;
  } | null>(null);
  const [violations, setViolations] = useState<ViolationSummary>(null);
  const [showPasses, setShowPasses] = useState(false);
  const passkey = useSyncExternalStore(subscribePasskey, passkeySnapshot, passkeyServerSnapshot);
  const [sensorAvailable, setSensorAvailable] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [refreshedAt, setRefreshedAt] = useState(0);
  const chainIntact = chainResult?.audit === state.audit && chainResult.refresh === refreshedAt ? chainResult.valid : null;
  const checking = chainIntact === null;
  const deviceKnown = hydrated && persistence.mode !== 'loading';

  // The browser's own answers — `isSecureContext`, `crossOriginIsolated`,
  // WebAuthn support, what `document.cookie` exposes. `null` is the state the
  // server rendered, and the first client render has to be that same state:
  // four checks the server marked "unknown" were being scored on the client's
  // opening frame, which is what made the ring disagree with itself (37 in the
  // HTML, 58 on screen) and cost React the whole subtree. They are read in an
  // effect instead, so the page hydrates as one document and the score only
  // moves once the browser has actually been asked.
  const [browserFacts, setBrowserFacts] = useState<BrowserFacts | null>(null);
  const pending = checking || !deviceKnown || browserFacts === null;

  const support = useMemo(() => (hydrated ? passkeySupport() : { available: false as const, reason: '' }), [hydrated]);

  useEffect(() => {
    void hasPlatformAuthenticator().then(setSensorAvailable);
  }, []);

  /**
   * Collected after mount, not during render — and off the effect body.
   *
   * Two things are being avoided at once. Reading `window` while rendering is
   * what made the server's 37 and the client's 58 disagree; reading it in an
   * effect body's first synchronous line cascades a second render before the
   * first paint for no reason. A microtask satisfies both: React has already
   * committed the hydrated tree, so the update is an ordinary one.
   */
  useEffect(() => {
    queueMicrotask(() => setBrowserFacts(readBrowserFacts()));
  }, [refreshedAt]);

  /**
   * Re-verify the chain, in the effect rather than through a callback.
   *
   * The awaiting happens inline so that every `setState` lands *after* a real
   * await, not synchronously inside the effect body — the latter is the
   * cascading-render pattern React warns about, and here it would re-render
   * the whole Trust Centre twice before the first frame. The cancellation
   * flag matters for the same reason the verification is async at all: the
   * chain is SHA-256 over every entry, and an owner can navigate away while
   * a long ledger is still hashing.
   */
  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    void verifyAuditChain(state.audit).then((valid) => {
      if (cancelled) return;
      setChainResult({ audit: state.audit, refresh: refreshedAt, valid });
    });
    return () => {
      cancelled = true;
    };
  }, [hydrated, state.audit, refreshedAt]);

  /**
   * How many CSP violations the server has counted since it started.
   *
   * `/api/report` stores nothing — only a tally per directive — so this is the
   * cheapest honest fact available: zero means no script, style or connection
   * has tried to do something the policy forbids. A non-zero number is not
   * necessarily an attack (a browser extension injecting a script trips it
   * too), which is why it is reported as a count to look at, not an alarm.
   */
  useEffect(() => {
    let cancelled = false;
    fetch('/api/report', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (cancelled || !payload?.ok) return;
        setViolations({ total: payload.total ?? 0, kinds: payload.kinds ?? [] });
      })
      .catch(() => {
        /* the score does not depend on it */
      });
    return () => {
      cancelled = true;
    };
  }, [refreshedAt]);

  const report = useMemo(
    () =>
      buildPostureReport(
        {
          vaultEncrypted: deviceKnown ? persistence.mode === 'encrypted' : null,
          lockEnabled: lock.enabled,
          autoLockMinutes: lock.autoLockMinutes,
          chainIntact,
          unchainedEntries: state.audit.filter((entry) => !entry.hash).length,
          syncConfigured: isSupabaseConfigured(),
          syncVerified: syncStatus === 'synced',
          privacyScreen: appearance.privacy,
          revealAll,
          passkeyEnrolled: passkey !== null,
        },
        browserFacts,
      ),
    [
      appearance.privacy,
      browserFacts,
      chainIntact,
      deviceKnown,
      persistence.mode,
      syncStatus,
      lock.autoLockMinutes,
      lock.enabled,
      passkey,
      revealAll,
      state.audit,
    ],
  );

  const gaps = report.checks.filter((check) => check.state === 'fail' || check.state === 'warn');
  const passes = report.checks.filter((check) => check.state === 'pass' || check.state === 'unknown');

  const ringColour =
    pending ? 'rgb(var(--c-stone-400) / 1)' : report.grade === 'excellent' || report.grade === 'good'
      ? 'rgb(var(--c-emerald-600) / 1)'
      : report.grade === 'fair'
        ? 'rgb(var(--c-amber-500) / 1)'
        : 'rgb(var(--c-red-500) / 1)';

  const addPasskey = useCallback(async () => {
    setEnrolling(true);
    const result = await enrollPasskey('This counter');
    setEnrolling(false);
    if (!result.ok) {
      toast.error('Passkey not added', result.error);
      return;
    }
    toast.success('Passkey added', 'This device’s sensor can now open the counter lock. Your PIN still works.');
  }, [toast]);

  const removePasskey = useCallback(() => {
    forgetPasskey();
    toast.info('Passkey removed', 'Unlock with your PIN from now on.');
  }, [toast]);

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
          <div className="shrink-0 self-center">
            <Ring
              value={pending ? 0 : report.score}
              size={128}
              strokeWidth={11}
              color={ringColour}
              track="rgb(var(--c-stone-200) / 1)"
              label={pending ? '—' : `${report.score}`}
              sublabel={pending ? 'Checking…' : 'out of 100'}
            />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-xl font-bold text-stone-900">
                {pending ? 'Checking…' : report.unknowns > 0 ? 'Live posture' : report.grade === 'excellent'
                  ? 'Your shop is well protected'
                  : report.grade === 'good'
                    ? 'Good, with a couple of gaps'
                    : report.grade === 'fair'
                      ? 'Protected, but there is real work to do'
                      : 'Important protections are off'}
              </h2>
              <Badge tone={pending ? 'slate' : gaps.length === 0 && report.unknowns === 0 ? 'emerald' : gaps.some((g) => g.state === 'fail') ? 'red' : 'amber'}>
                {pending ? 'Checking…' : gaps.length === 0 ? report.unknowns > 0 ? 'unverified' : 'Nothing to fix' : `${gaps.length} to look at`}
              </Badge>
            </div>

            <p className="mt-2 text-sm leading-relaxed text-stone-600">
              Measured just now from this browser, not from a settings file — each line below says what was read and
              where. Weighted by consequence, so a missing counter PIN costs more than an unblurred figure.
              {report.unknowns > 0
                ? ` ${report.unknowns} check${report.unknowns === 1 ? '' : 's'} could not be answered in this browser and ${report.unknowns === 1 ? 'is' : 'are'} left out of the score rather than counted as a pass.`
                : ''}
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setRefreshedAt((value) => value + 1);
                }}
                disabled={checking}
              >
                <RefreshCw size={14} className={checking ? 'animate-spin' : ''} />
                {checking ? 'Checking…' : 'Check again'}
              </Button>
              {violations ? (
                <Badge tone={violations.total === 0 ? 'emerald' : 'amber'}>
                  {violations.total === 0
                    ? 'No policy violations since start-up'
                    : `${violations.total} policy violation${violations.total === 1 ? '' : 's'} counted`}
                </Badge>
              ) : null}
            </div>
          </div>
        </div>
      </Card>

      {/* ------------------------------------------------------------ gaps */}

      {gaps.length > 0 ? (
        <Card>
          <CardTitle icon={<ShieldAlert size={15} />}>Worth your attention</CardTitle>
          <p className="mt-2 text-xs leading-relaxed text-stone-600">
            In the order a shop would feel them. Each one names the fix; none of them needs a technician.
          </p>
          <div className="mt-4 space-y-2.5">
            {gaps
              .slice()
              .sort((a, b) => (a.state === b.state ? b.weight - a.weight : a.state === 'fail' ? -1 : 1))
              .map((check) => (
                <CheckRow key={check.id} check={check} />
              ))}
          </div>
        </Card>
      ) : (
        <Card>
          <CardTitle icon={<ShieldCheck size={15} />}>Nothing to fix</CardTitle>
          <p className="mt-3 text-sm leading-relaxed text-stone-600">
            Every check that could be answered in this browser passed. That is not a promise that nothing can go
            wrong — it is a statement that the controls DukaanOS ships are on, right now, on this device.
          </p>
        </Card>
      )}

      {/* --------------------------------------------------------- passkey */}

      <Card>
        <CardTitle icon={<Fingerprint size={15} />}>Unlock with this device</CardTitle>
        <p className="mt-2 text-xs leading-relaxed text-stone-600">
          A PIN on a counter is not broken by cryptography, it is broken by being typed forty times a day in front of
          whoever is standing at the till. A passkey lets the tablet’s own sensor open the lock instead — nothing to
          watch, nothing to type.
        </p>
        <p className="mt-2 text-xs leading-relaxed text-stone-600">
          DukaanOS stores one thing: a credential id. Not a fingerprint, not a face, not a template of either — the
          match happens inside the device and never reaches us. Your PIN keeps working, deliberately: a passkey tied
          to a tablet that falls in a bucket of water must never be the only way into your books.
        </p>

        <div className="mt-4">
          {!support.available ? (
            <div className="rounded-xl bg-stone-100 p-3 text-xs leading-relaxed text-stone-600 ring-1 ring-inset ring-stone-200">
              {support.reason || 'Checking this browser…'}
            </div>
          ) : passkey ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-emerald-500/[0.06] p-3 ring-1 ring-inset ring-emerald-500/20">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-emerald-700">{passkey.label}</p>
                <p className="mt-0.5 text-xs text-stone-600">
                  Added {new Date(passkey.createdAt).toLocaleDateString('en-IN')}
                  {passkey.lastUsedAt
                    ? ` · last used ${new Date(passkey.lastUsedAt).toLocaleDateString('en-IN')}`
                    : ' · not used yet'}
                </p>
              </div>
              <Button variant="ghost" onClick={removePasskey}>
                <Trash2 size={14} />
                Remove
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <Button onClick={() => void addPasskey()} disabled={enrolling || !lock.enabled}>
                <Fingerprint size={14} />
                {enrolling ? 'Waiting for the sensor…' : 'Add a passkey'}
              </Button>
              {!lock.enabled ? (
                <p className="text-xs text-stone-600">
                  Set a counter PIN first — a passkey opens the counter lock, so there has to be a lock to open.
                </p>
              ) : !sensorAvailable ? (
                <p className="text-xs text-stone-600">
                  This device reports no built-in fingerprint or face sensor. You can still try — a security key will
                  work too.
                </p>
              ) : null}
            </div>
          )}
        </div>
      </Card>

      {/* ---------------------------------------------------------- passes */}

      {passes.length > 0 ? (
        <Card>
          <button
            type="button"
            onClick={() => setShowPasses((value) => !value)}
            data-press="soft"
            className="flex w-full items-center justify-between gap-3 text-left"
          >
            <span>
              <span className="block font-display text-sm font-bold text-stone-900">
                What is already holding
              </span>
              <span className="mt-0.5 block text-xs text-stone-600">
                {passes.length} check{passes.length === 1 ? '' : 's'}, with the evidence for each
              </span>
            </span>
            <ChevronDown
              size={18}
              className={`shrink-0 text-stone-500 transition-transform duration-base ease-settle ${showPasses ? 'rotate-180' : ''}`}
            />
          </button>

          {showPasses ? (
            <div className="mt-4 space-y-5">
              {(['transport', 'device', 'records', 'console'] as const).map((group) => {
                const rows = passes.filter((check) => check.group === group);
                if (rows.length === 0) return null;
                return (
                  <div key={group}>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">
                      {GROUP_LABELS[group]}
                    </p>
                    <div className="mt-2 space-y-2.5">
                      {rows.map((check) => (
                        <CheckRow key={check.id} check={check} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </Card>
      ) : null}

      {/* ------------------------------------------------------ violations */}

      {violations && violations.total > 0 ? (
        <Card>
          <CardTitle icon={<AlertTriangle size={15} />}>Blocked by the content policy</CardTitle>
          <p className="mt-2 text-xs leading-relaxed text-stone-600">
            The browser refused{' '}
            <AnimatedNumber
              value={violations.total}
              format={(value) => String(Math.round(value))}
              className="font-semibold text-stone-900"
            /> attempt
            {violations.total === 1 ? '' : 's'} to load or run something this console does not allow, and told the
            server. Only a count per rule is kept — never a URL, never a page, never anything from your records. A
            browser extension injecting a script shows up here too, so this is a number to read, not an alarm.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {violations.kinds.slice(0, 8).map((kind) => (
              <Badge key={kind.kind} tone="slate">
                {kind.kind} · {kind.count}
              </Badge>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}

