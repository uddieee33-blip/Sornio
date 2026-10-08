'use client';

/**
 * The card that sets the counter lock.
 *
 * Written for the person who actually owns the counter, not for a security
 * engineer: it says what the lock stops (someone picking up the tablet), what
 * it does not stop (someone who takes the device home), and what a forgotten
 * PIN really costs. The setup is one screen, the auto-lock choice is a row of
 * buttons, and turning it off requires the current PIN — so the person who set
 * it is the only one who can remove it.
 */

import { useState } from 'react';
import { KeyRound, Lock, ShieldCheck, TimerReset } from 'lucide-react';
import { Card, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useCounterLock } from '@/components/security/counter-lock';
import { AUTO_LOCK_CHOICES, PIN_LENGTH } from '@/lib/security/lock';

const inputClass =
  'w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 font-mono text-sm tracking-[0.3em] text-stone-900 placeholder-stone-400 outline-none transition focus:border-portal/50 focus:ring-2 focus:ring-focus';

function autoLockLabel(minutes: number): string {
  if (minutes === 0) return 'Never';
  if (minutes < 60) return `${minutes} min`;
  if (minutes === 60) return '1 hour';
  return `${Math.round(minutes / 60)} hours`;
}

export function DeviceLockCard() {
  const lock = useCounterLock();
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [currentPin, setCurrentPin] = useState('');
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const digitsOnly = (value: string) => value.replace(/\D/g, '').slice(0, PIN_LENGTH);

  const handleEnable = async () => {
    if (pin !== confirmPin) {
      setMessage({ tone: 'error', text: 'The two PINs do not match.' });
      return;
    }
    setBusy(true);
    const result = await lock.setPin(pin, lock.autoLockMinutes);
    setBusy(false);
    if (result.ok) {
      setPin('');
      setConfirmPin('');
      setMessage({ tone: 'ok', text: 'The counter lock is on. Lock it now or let it lock itself when the counter goes idle.' });
    } else {
      setMessage({ tone: 'error', text: result.error ?? 'That PIN could not be used.' });
    }
  };

  const handleChange = async () => {
    if (pin !== confirmPin) {
      setMessage({ tone: 'error', text: 'The two new PINs do not match.' });
      return;
    }
    setBusy(true);
    const result = await lock.changePin(currentPin, pin);
    setBusy(false);
    if (result.ok) {
      setPin('');
      setConfirmPin('');
      setCurrentPin('');
      setMessage({ tone: 'ok', text: 'PIN changed.' });
    } else {
      setMessage({ tone: 'error', text: result.error ?? 'That PIN could not be changed.' });
    }
  };

  const handleDisable = async () => {
    setBusy(true);
    const result = await lock.disable(currentPin);
    setBusy(false);
    if (result.ok) {
      setCurrentPin('');
      setMessage({ tone: 'ok', text: 'The counter lock is off. Anyone who picks up this device can open the console.' });
    } else {
      setMessage({ tone: 'error', text: result.error ?? 'That PIN is not right.' });
    }
  };

  return (
    <Card className="mb-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <CardTitle icon={<Lock size={16} />}>Counter lock</CardTitle>
        {lock.enabled ? (
          <Badge tone="emerald" dot>On · locks after {autoLockLabel(lock.autoLockMinutes)}</Badge>
        ) : (
          <Badge tone="amber" dot>Off</Badge>
        )}
      </div>

      <p className="mt-3 text-sm leading-relaxed text-stone-600">
        A {PIN_LENGTH}-digit PIN on this device, so the tablet on your counter does not show today&apos;s takings, your
        udhaar khata and your customer list to whoever picks it up. The PIN is stored here as a PBKDF2 hash and is never
        sent anywhere.
      </p>

      {/* The honest limit, in the owner's words, before the controls. */}
      <p className="mt-3 rounded-xl border border-stone-200 bg-stone-50 p-3 text-xs leading-relaxed text-stone-600">
        <strong className="text-stone-800">What this does and does not do.</strong> It stops a customer, a delivery
        person or a curious neighbour from opening your console. It does not stop somebody who takes the device away and
        has an hour and a laptop — for that, sign in with your Supabase account, which lives on the server and cannot be
        rewritten on the device.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold text-stone-700">
          {lock.enabled ? 'New PIN' : `Choose a ${PIN_LENGTH}-digit PIN`}
          <input
            value={pin}
            onChange={(event) => setPin(digitsOnly(event.target.value))}
            inputMode="numeric"
            autoComplete="off"
            type="password"
            aria-label={lock.enabled ? 'New PIN' : 'Choose a PIN'}
            placeholder="••••••"
            className={`mt-1.5 ${inputClass}`}
          />
        </label>
        <label className="text-xs font-semibold text-stone-700">
          Repeat it
          <input
            value={confirmPin}
            onChange={(event) => setConfirmPin(digitsOnly(event.target.value))}
            inputMode="numeric"
            autoComplete="off"
            type="password"
            aria-label="Repeat the PIN"
            placeholder="••••••"
            className={`mt-1.5 ${inputClass}`}
          />
        </label>
        {lock.enabled ? (
          <label className="text-xs font-semibold text-stone-700 sm:col-span-2">
            Current PIN (needed to change or remove it)
            <input
              value={currentPin}
              onChange={(event) => setCurrentPin(digitsOnly(event.target.value))}
              inputMode="numeric"
              autoComplete="off"
              type="password"
              aria-label="Current PIN"
              placeholder="••••••"
              className={`mt-1.5 ${inputClass}`}
            />
          </label>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {lock.enabled ? (
          <>
            <Button onClick={() => void handleChange()} disabled={busy || pin.length !== PIN_LENGTH || currentPin.length !== PIN_LENGTH}>
              <KeyRound size={15} /> Change PIN
            </Button>
            <Button variant="secondary" onClick={lock.lockNow}>
              <Lock size={15} /> Lock now
            </Button>
            <Button variant="ghost" onClick={() => void handleDisable()} disabled={busy || currentPin.length !== PIN_LENGTH}>
              Turn the lock off
            </Button>
          </>
        ) : (
          <Button onClick={() => void handleEnable()} disabled={busy || pin.length !== PIN_LENGTH || confirmPin.length !== PIN_LENGTH}>
            <ShieldCheck size={15} /> Turn the counter lock on
          </Button>
        )}
      </div>

      {lock.enabled ? (
        <div className="mt-5 border-t border-stone-200 pt-4">
          <p className="flex items-center gap-2 text-xs font-bold text-stone-700">
            <TimerReset size={14} /> Lock the console after the counter has been idle for
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {AUTO_LOCK_CHOICES.map((minutes) => (
              <button
                key={minutes}
                type="button"
                onClick={() => lock.setAutoLock(minutes)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-semibold ring-1 ring-inset transition ${
                  lock.autoLockMinutes === minutes
                    ? 'bg-brand-500/15 text-brand-700 ring-brand-400/30'
                    : 'text-stone-600 ring-stone-200 hover:bg-stone-50'
                }`}
                aria-pressed={lock.autoLockMinutes === minutes}
              >
                {autoLockLabel(minutes)}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-stone-500">
            The lock also engages when this tab is left in the background for longer than the period you pick. &ldquo;Never&rdquo;
            means only the Lock button locks it — not recommended on a shared counter.
          </p>
        </div>
      ) : null}

      {message ? (
        <p
          className={`mt-4 rounded-xl px-3.5 py-2.5 text-xs font-medium ${
            message.tone === 'ok' ? 'bg-emerald-500/10 text-emerald-700' : 'bg-red-500/10 text-red-700'
          }`}
          role="status"
        >
          {message.text}
        </p>
      ) : null}
    </Card>
  );
}
