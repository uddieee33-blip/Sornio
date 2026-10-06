'use client';

/**
 * The counter lock, as the console experiences it.
 *
 * Three things this component is deliberate about:
 *
 *   1. **It replaces the console, it does not cover it.** While locked, the
 *      shell renders the keypad *instead of* the sidebar, the top bar and the
 *      page. A blurred overlay would still have the day's takings in the DOM —
 *      one "inspect element" away from the person standing at the counter.
 *   2. **It locks on idleness, not on a timer of its own invention.** The clock
 *      is only read while something is happening (activity, a tab switch, the
 *      lockout countdown), so a locked counter is not a page spinning a timer
 *      every second on a shop's cheap PC.
 *   3. **It never pretends to be more than it is.** The PIN protects the device
 *      from a passer-by. The card that sets it says so, and the way out of a
 *      forgotten PIN is stated with its real cost.
 *
 * The lock record is written to `localStorage` (the lock must be readable before
 * the console is unlocked — the encrypted vault is not), and a per-tab flag in
 * `sessionStorage` records that this shift has already been unlocked once.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { Delete, Lock, ShieldAlert } from 'lucide-react';
import {
  DEFAULT_AUTO_LOCK_MINUTES,
  MAX_ATTEMPTS,
  PIN_LENGTH,
  clearLockRecord,
  createLockRecord,
  describeWait,
  disableLock,
  isUnlockedThisSession,
  lockoutRemainingMs,
  markLocked,
  markUnlocked,
  normalizeAutoLock,
  readLockRecord,
  verifyPin,
  withAutoLock,
  writeLockRecord,
  type LockRecord,
} from '@/lib/security/lock';

type CounterLockValue = {
  enabled: boolean;
  locked: boolean;
  autoLockMinutes: number;
  /** Someone attempted the console while it was locked. */
  attempts: number;
  setPin: (pin: string, autoLockMinutes?: number) => Promise<{ ok: boolean; error?: string }>;
  changePin: (currentPin: string, nextPin: string) => Promise<{ ok: boolean; error?: string }>;
  disable: (currentPin: string) => Promise<{ ok: boolean; error?: string }>;
  setAutoLock: (minutes: number) => void;
  unlock: (pin: string) => Promise<{ ok: boolean; error?: string }>;
  lockNow: () => void;
  /** Erase the lock only — used when the owner has lost the PIN and accepts the cost. */
  forget: () => void;
  record: LockRecord | null;
};

const CounterLockContext = createContext<CounterLockValue | null>(null);

/** Activity that means "a person is using the counter". */
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;

/**
 * The lock lives in an external store, read through `useSyncExternalStore`.
 *
 * The alternative — reading `localStorage` inside an effect and calling
 * `setState` — renders the console once before the lock is known and is exactly
 * the pattern React warns about; here the console subscribes to the lock and
 * gets one clean transition instead.
 *
 * The server snapshot is deliberately **"no lock"**, not "unknown", because a
 * console page that cannot be server-rendered is a console that paints empty on
 * every load. Hydration then matches, and the client snapshot (a synchronous
 * `localStorage` read) is applied before the browser paints — while the data
 * itself is still unread. The vault that holds the owner's records decrypts in
 * an async effect after mount (PBKDF2, 120k iterations), so a locked console is
 * replaced by its keypad a long time before any of the owner's data exists in
 * the page.
 */
type LockSnapshot = { record: LockRecord | null; unlocked: boolean };

const SERVER_SNAPSHOT: LockSnapshot = { record: null, unlocked: true };
let clientSnapshot: LockSnapshot | null = null;
const lockListeners = new Set<() => void>();

function getLockSnapshot(): LockSnapshot {
  if (!clientSnapshot) {
    clientSnapshot = { record: readLockRecord(), unlocked: isUnlockedThisSession() };
  }
  return clientSnapshot;
}

function getServerLockSnapshot(): LockSnapshot {
  return SERVER_SNAPSHOT;
}

function subscribeToLock(listener: () => void) {
  lockListeners.add(listener);
  return () => {
    lockListeners.delete(listener);
  };
}

/** The one place the snapshot moves. Keeps the tab flag and the record together. */
function publishLock(next: Partial<LockSnapshot>): void {
  const current = getLockSnapshot();
  clientSnapshot = { ...current, ...next };
  for (const listener of lockListeners) listener();
}

export function CounterLockProvider({ children }: { children: ReactNode }) {
  const snapshot = useSyncExternalStore(subscribeToLock, getLockSnapshot, getServerLockSnapshot);
  const record = snapshot.record;
  const locked = Boolean(record?.enabled) && !snapshot.unlocked;
  const [attempts, setAttempts] = useState(0);
  // Only used to re-render the lockout countdown; never runs while unlocked.
  const [, forceTick] = useState(0);
  const lastActivity = useRef(0);
  const hiddenAt = useRef<number | null>(null);

  const persist = useCallback((next: LockRecord) => {
    writeLockRecord(next);
    publishLock({ record: next });
  }, []);

  const lockNow = useCallback(() => {
    if (!record?.enabled) return;
    markLocked();
    lastActivity.current = Date.now();
    publishLock({ unlocked: false });
  }, [record?.enabled]);

  const unlock = useCallback(
    async (pin: string) => {
      const current = record;
      if (!current?.enabled) return { ok: false, error: 'The counter lock is not set up on this device.' };
      const verdict = await verifyPin(pin, current);
      if (verdict.record) persist(verdict.record);
      if (!verdict.ok) {
        setAttempts((value) => value + 1);
        return { ok: false, error: verdict.error };
      }
      markUnlocked();
      lastActivity.current = Date.now();
      setAttempts(0);
      publishLock({ unlocked: true });
      return { ok: true };
    },
    [persist, record],
  );

  const setPin = useCallback(
    async (pin: string, autoLockMinutes = DEFAULT_AUTO_LOCK_MINUTES) => {
      const created = await createLockRecord(pin, autoLockMinutes);
      if (!created.ok) return { ok: false, error: created.error };
      const written = writeLockRecord(created.record);
      if (!written.ok) return { ok: false, error: written.error };
      clientSnapshot = null;
      markUnlocked();
      lastActivity.current = Date.now();
      publishLock({ record: created.record, unlocked: true });
      return { ok: true };
    },
    [],
  );

  const changePin = useCallback(
    async (currentPin: string, nextPin: string) => {
      if (!record?.enabled) return { ok: false, error: 'Set a PIN first.' };
      const verdict = await verifyPin(currentPin, record);
      if (!verdict.ok) {
        if (verdict.record) persist(verdict.record);
        return { ok: false, error: verdict.error };
      }
      const created = await createLockRecord(nextPin, record.autoLockMinutes);
      if (!created.ok) return { ok: false, error: created.error };
      const written = writeLockRecord(created.record);
      if (!written.ok) return { ok: false, error: written.error };
      publishLock({ record: created.record });
      return { ok: true };
    },
    [persist, record],
  );

  const disable = useCallback(
    async (currentPin: string) => {
      if (!record?.enabled) return { ok: true };
      const verdict = await verifyPin(currentPin, record);
      if (!verdict.ok) {
        if (verdict.record) persist(verdict.record);
        return { ok: false, error: verdict.error };
      }
      clearLockRecord();
      publishLock({ record: disableLock(record), unlocked: true });
      return { ok: true };
    },
    [persist, record],
  );

  const setAutoLock = useCallback(
    (minutes: number) => {
      if (!record) return;
      persist(withAutoLock(record, minutes));
    },
    [persist, record],
  );

  const forget = useCallback(() => {
    clearLockRecord();
    publishLock({ record: null, unlocked: true });
    setAttempts(0);
  }, []);

  // ---- Auto-lock ----------------------------------------------------------
  const autoLockMs = record?.enabled && record.autoLockMinutes > 0 ? record.autoLockMinutes * 60_000 : 0;

  useEffect(() => {
    if (!record?.enabled) return;

    const note = () => {
      lastActivity.current = Date.now();
    };
    // Subscribe time counts as activity: a console nobody has touched since it
    // loaded gets the full idle period before it locks itself.
    note();
    for (const event of ACTIVITY_EVENTS) window.addEventListener(event, note, { passive: true });

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt.current = Date.now();
      } else {
        // Coming back to a tab that sat hidden past the limit locks immediately,
        // which is the case that actually matters (the owner walked away).
        if (hiddenAt.current && autoLockMs > 0 && Date.now() - hiddenAt.current >= autoLockMs && !locked) lockNow();
        hiddenAt.current = null;
        note();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      for (const event of ACTIVITY_EVENTS) window.removeEventListener(event, note);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [autoLockMs, locked, lockNow, record?.enabled]);

  /**
   * One check every 15 seconds while unlocked — cheap enough to be invisible on
   * a shop PC, frequent enough that the counter cannot be left open for long
   * past its limit. While locked it also refreshes the lockout countdown.
   */
  useEffect(() => {
    const interval = window.setInterval(() => {
      if (locked) {
        forceTick((value) => value + 1);
        return;
      }
      if (autoLockMs > 0 && Date.now() - lastActivity.current >= autoLockMs) lockNow();
    }, 15_000);
    return () => window.clearInterval(interval);
  }, [autoLockMs, lockNow, locked]);

  const value = useMemo<CounterLockValue>(
    () => ({
      enabled: Boolean(record?.enabled),
      locked: Boolean(record?.enabled) && locked,
      autoLockMinutes: record ? normalizeAutoLock(record.autoLockMinutes) : DEFAULT_AUTO_LOCK_MINUTES,
      attempts,
      setPin,
      changePin,
      disable,
      setAutoLock,
      unlock,
      lockNow,
      forget,
      record,
    }),
    [attempts, changePin, disable, forget, lockNow, locked, record, setAutoLock, setPin, unlock],
  );

  return <CounterLockContext.Provider value={value}>{children}</CounterLockContext.Provider>;
}

export function useCounterLock(): CounterLockValue {
  const value = useContext(CounterLockContext);
  if (!value) throw new Error('useCounterLock must be used inside CounterLockProvider.');
  return value;
}

/** The keypad, sized for a thumb on a counter tablet. */
export function CounterLockScreen() {
  const { unlock, attempts, record, forget } = useCounterLock();
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [eraseConfirm, setEraseConfirm] = useState('');
  const [now, setNow] = useState(() => Date.now());

  const waitMs = lockoutRemainingMs(record, now);
  const paused = waitMs > 0;

  useEffect(() => {
    if (!paused) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [paused]);

  const submit = useCallback(
    async (candidate: string) => {
      setBusy(true);
      const result = await unlock(candidate);
      setBusy(false);
      setPin('');
      setError(result.ok ? null : result.error ?? 'Wrong PIN.');
      setNow(Date.now());
    },
    [unlock],
  );

  const press = (digit: string) => {
    if (paused || busy) return;
    setError(null);
    const next = (pin + digit).slice(0, PIN_LENGTH);
    setPin(next);
    if (next.length === PIN_LENGTH) void submit(next);
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-ink px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-gradient text-white shadow-glow">
            <Lock size={24} />
          </span>
          <h1 className="mt-5 font-display text-2xl font-bold text-stone-900">Console locked</h1>
          <p className="mt-2 text-sm text-stone-600">
            Enter your {PIN_LENGTH}-digit PIN to open the counter.
            {attempts > 0 ? ` ${attempts} wrong ${attempts === 1 ? 'attempt' : 'attempts'} so far.` : ''}
          </p>
        </div>

        <div className="mt-6 flex justify-center gap-3" aria-label={`${pin.length} of ${PIN_LENGTH} digits entered`}>
          {Array.from({ length: PIN_LENGTH }).map((_, index) => (
            <span
              key={index}
              className={`h-3.5 w-3.5 rounded-full transition ${index < pin.length ? 'bg-brand-500' : 'bg-stone-300'}`}
            />
          ))}
        </div>

        <p className="mt-4 min-h-[2.5rem] text-center text-sm font-medium text-red-600" role="alert">
          {paused ? `Too many wrong PINs. Try again in ${describeWait(waitMs)}.` : error ?? ''}
        </p>

        <div className="mt-2 grid grid-cols-3 gap-3">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              type="button"
              disabled={paused || busy}
              onClick={() => press(digit)}
              className="min-h-14 rounded-2xl bg-white font-display text-xl font-bold text-stone-800 ring-1 ring-stone-200 transition active:scale-[0.97] disabled:opacity-40"
            >
              {digit}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setShowHelp((value) => !value)}
            className="min-h-14 rounded-2xl bg-stone-100 text-xs font-bold text-stone-600 ring-1 ring-stone-200"
          >
            Forgot?
          </button>
          <button
            type="button"
            disabled={paused || busy}
            onClick={() => press('0')}
            className="min-h-14 rounded-2xl bg-white font-display text-xl font-bold text-stone-800 ring-1 ring-stone-200 transition active:scale-[0.97] disabled:opacity-40"
          >
            0
          </button>
          <button
            type="button"
            disabled={paused || busy || pin.length === 0}
            onClick={() => {
              setError(null);
              setPin((value) => value.slice(0, -1));
            }}
            aria-label="Delete last digit"
            className="flex min-h-14 items-center justify-center rounded-2xl bg-stone-100 text-stone-600 ring-1 ring-stone-200 disabled:opacity-40"
          >
            <Delete size={18} />
          </button>
        </div>

        {showHelp ? (
          <div className="mt-5 rounded-2xl border border-amber-500/30 bg-amber-500/[0.07] p-4 text-xs leading-relaxed text-amber-900">
            <p className="flex items-center gap-2 font-bold">
              <ShieldAlert size={14} /> If the PIN is lost
            </p>
            <p className="mt-2">
              Nobody can recover it for you — there is no account behind it and no copy of the PIN anywhere, which is
              the point. The way back in is to clear the lock and start this device again: your records stay on the
              device and in your synced account, but anything only ever held in this browser should be exported first
              if you still can.
            </p>
            <input
              value={eraseConfirm}
              onChange={(event) => setEraseConfirm(event.target.value)}
              placeholder='Type ERASE to confirm'
              aria-label="Type ERASE to confirm clearing the lock"
              className="mt-3 w-full rounded-xl border border-amber-500/30 bg-white px-3 py-2.5 font-mono text-sm text-stone-900 outline-none"
            />
            <button
              type="button"
              disabled={eraseConfirm.trim().toUpperCase() !== 'ERASE'}
              onClick={forget}
              className="mt-2 w-full rounded-xl bg-amber-600 px-3 py-2.5 text-xs font-bold text-white disabled:opacity-40"
            >
              Clear the lock on this device
            </button>
          </div>
        ) : null}

        <p className="mt-6 text-center text-[11px] leading-relaxed text-stone-500">
          The PIN is kept on this device only, as a PBKDF2 hash — never sent anywhere, never stored by DukaanOS.
        </p>
      </div>
    </div>
  );
}

export { MAX_ATTEMPTS };
