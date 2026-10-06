'use client';

/**
 * Devices — the page a shopkeeper opens when a scanner "is not working".
 *
 * Almost every such report is one of six things, and every one of them is
 * answerable *on this device* rather than over a support call:
 *
 *   1. the scanner is not plugged in (nothing arrives in the test box);
 *   2. it is plugged in but the cursor is not in a code field (so the scan goes
 *      nowhere) — the test box says what a live read looks like;
 *   3. the page is inside another app's frame, so the browser withholds the
 *      camera (named, with a way out);
 *   4. the camera has been blocked for this site in browser settings (named);
 *   5. the browser has no built-in decoder — Safari, Firefox (named, with the
 *      wedge and the keypad as the honest fallback);
 *   6. the device has no fingerprint sensor (named, with the USB-reader route).
 *
 * The test box is the heart of it: scan into it and DukaanOS tells you whether
 * the input came from a machine or a person, by measuring the gaps between
 * keystrokes. That is a real measurement of the real hardware in front of you,
 * not a compatibility list.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ArrowUpRight,
  Camera,
  CheckCircle2,
  Fingerprint,
  Keyboard,
  ScanBarcode,
  Usb,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Card, CardTitle } from '@/components/ui/Card';
import { usePortal } from '@/lib/portals/portal-provider';
import {
  COUNTER_FORMATS,
  detectCaptureReadiness,
  formatLabel,
  readWedgeBurst,
  ownTabUrl,
  type WedgeReadout,
} from '@/lib/scanning/device';
import { guessSymbology, isValidGtin, looksLikeCode, normalizeCode } from '@/lib/scanning/barcodes';
import type { CaptureReadiness } from '@/lib/scanning/types';

const CHANNEL_LABEL: Record<string, string> = {
  barcode: 'Handheld barcode scanner',
  qr: 'QR / job tags',
  keypad: 'Typed entry',
  fingerprint: 'Fingerprint pad',
};

type Row = { key: string; icon: ReactNode; label: string; ready: boolean | null; note: string };

export function DeviceCheck() {
  const { portal } = usePortal();
  const [readiness, setReadiness] = useState<CaptureReadiness | null>(null);
  const [readout, setReadout] = useState<WedgeReadout | null>(null);
  const [probe, setProbe] = useState('');
  const gaps = useRef<number[]>([]);
  const lastKeyAt = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // One async read of the device, after mount, so render stays pure and the
  // server has nothing to disagree with. `embedded` arrives with the rest.
  useEffect(() => {
    let cancelled = false;
    void detectCaptureReadiness().then((next) => {
      if (!cancelled) setReadiness(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const embedded = readiness?.embedded ?? false;

  const channels = portal.capture.channels;

  /** Every keystroke in the test box is timed; Enter closes the read. */
  const onProbeKey = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const now = performance.now();
    if (event.key === 'Enter') {
      const code = normalizeCode(probe);
      if (code.length >= 4) setReadout(readWedgeBurst(code, gaps.current));
      gaps.current = [];
      lastKeyAt.current = null;
      setProbe('');
      return;
    }
    if (event.key.length === 1) {
      if (lastKeyAt.current !== null) gaps.current.push(now - lastKeyAt.current);
      lastKeyAt.current = now;
    }
  };

  const verdict = useMemo(() => {
    if (!readout) return null;
    const code = readout.code;
    const plausible = looksLikeCode(code);
    const symbology = guessSymbology(code);
    const gtinShaped = [8, 12, 13, 14].includes(code.length) && /^\d+$/.test(code);
    const checkDigit = gtinShaped ? (isValidGtin(code) ? 'valid' : 'invalid') : 'n/a';
    return { code, plausible, symbology, checkDigit };
  }, [readout]);

  const rows: Row[] = [];
  if (channels.includes('barcode') || channels.includes('qr')) {
    rows.push({
      key: 'wedge',
      icon: <Usb size={15} />,
      label: 'Handheld scanner (USB / Bluetooth)',
      ready: true,
      note:
        readiness?.wedge.note ??
        'A barcode scanner is a keyboard that types very fast. Plug it in, put the cursor in a code box, and scan — nothing to install and no permission to grant.',
    });
    rows.push({
      key: 'camera',
      icon: <Camera size={15} />,
      label: channels.includes('barcode') ? 'Camera scanning' : 'Camera for QR tags',
      ready: readiness ? readiness.camera.available : null,
      note: readiness?.camera.available
        ? 'This device can read a label with its camera. The frame is decoded on the device — nothing is uploaded.'
        : readiness?.camera.reason ?? 'Asking this device…',
    });
    rows.push({
      key: 'decoder',
      icon: <ScanBarcode size={15} />,
      label: 'Decoding on this device',
      ready: readiness ? readiness.onDeviceDecoder.available : null,
      note: readiness?.onDeviceDecoder.available
        ? 'The browser decodes barcodes itself, so a camera read never leaves the device and works with no signal.'
        : readiness?.onDeviceDecoder.reason ?? 'Asking this device…',
    });
  }
  if (channels.includes('fingerprint')) {
    rows.push({
      key: 'fingerprint',
      icon: <Fingerprint size={15} />,
      label: 'Fingerprint sensor',
      ready: readiness ? readiness.fingerprint.available : null,
      note: readiness?.fingerprint.available
        ? 'The sensor on this device can open a member’s visit. The finger is matched inside the sensor; only a credential id is ever stored.'
        : readiness?.fingerprint.reason ?? 'Asking this device…',
    });
  }
  if (channels.includes('keypad') || rows.length === 0) {
    rows.push({
      key: 'keypad',
      icon: <Keyboard size={15} />,
      label: 'Typed entry',
      ready: true,
      note: 'Always available: works when a label is torn, a battery is flat, or the internet is down.',
    });
  }

  return (
    <div className="space-y-5">
      {embedded ? (
        <Card className="animate-fade-up ring-2 ring-amber-400/40">
          <CardTitle icon={<ArrowUpRight size={16} />}>This page is inside another app’s frame</CardTitle>
          <p className="mt-3 text-sm leading-relaxed text-stone-700">
            DukaanOS is being shown inside a preview panel or another app’s built-in browser. Those frames are not
            allowed to use the camera or the fingerprint sensor unless the app that embedded them hands the permission
            over — and most do not. <strong>Nothing is wrong with your scanner.</strong> The handheld scanner and typed
            entry work here right now; the camera and the fingerprint pad will work as soon as this page has its own tab.
          </p>
          <p className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                // Read at click time: the URL is not state, and a frame cannot
                // always be trusted to describe it during render.
                const url = ownTabUrl();
                if (url) window.open(url, '_blank', 'noopener,noreferrer');
              }}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-brand-gradient px-4 py-2 text-sm font-bold text-white shadow-glow-sm"
            >
              Open in its own tab <ArrowUpRight size={14} />
            </button>
            <span className="text-xs text-stone-600">Then reload and this panel will say the camera is ready.</span>
          </p>
        </Card>
      ) : null}

      <Card className="animate-fade-up">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle icon={<ScanBarcode size={16} />}>Test your scanner here</CardTitle>
          {readout ? (
            <Badge tone={readout.verdict === 'machine' ? 'emerald' : readout.verdict === 'human' ? 'amber' : 'slate'} dot>
              {readout.verdict === 'machine' ? 'Machine read' : readout.verdict === 'human' ? 'Typed by hand' : 'Unclear'}
            </Badge>
          ) : (
            <Badge tone="slate">Waiting for a scan</Badge>
          )}
        </div>

        <p className="mt-3 text-sm leading-relaxed text-stone-600">
          Scan any packet — or type a code and press Enter. DukaanOS times every keystroke, so it can tell you whether
          what arrived came from your scanner or from a person, and it reads the same code the counter would.
        </p>

        <label className="mt-4 block text-xs font-semibold text-stone-700">
          Scan or type here, then press Enter
          <input
            ref={inputRef}
            value={probe}
            onChange={(event) => setProbe(event.target.value)}
            onKeyDown={onProbeKey}
            inputMode="text"
            autoComplete="off"
            spellCheck={false}
            aria-label="Scanner test box"
            placeholder="Waiting for a code…"
            className="mt-1.5 w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-3 font-mono text-base text-stone-900 placeholder-stone-400 outline-none transition focus:border-brand-400/60 focus:ring-2 focus:ring-brand-500/20"
          />
        </label>

        <button
          type="button"
          onClick={() => inputRef.current?.focus()}
          className="mt-2 text-xs font-bold text-brand-600 underline decoration-dotted"
        >
          Put the cursor back in this box
        </button>

        {readout && verdict ? (
          <div className="mt-4 space-y-3">
            <p
              className={`rounded-xl px-3.5 py-3 text-sm ${
                readout.verdict === 'machine'
                  ? 'bg-emerald-500/[0.09] text-emerald-800'
                  : readout.verdict === 'human'
                    ? 'bg-amber-500/[0.09] text-amber-800'
                    : 'bg-stone-100 text-stone-700'
              }`}
            >
              {readout.summary}
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <Detail label="Code read" value={verdict.code} mono />
              <Detail label="Symbology" value={verdict.symbology ?? 'Not recognised as a retail code'} />
              <Detail
                label="Retail check digit"
                value={
                  verdict.checkDigit === 'valid'
                    ? 'Valid — this is a real retail barcode'
                    : verdict.checkDigit === 'invalid'
                      ? 'Does not match — the label may be damaged'
                      : 'Not applicable to this code'
                }
              />
              <Detail label="Speed" value={`${readout.length} characters in ${Math.round(readout.elapsedMs)} ms · ${Math.round(readout.averageGapMs)} ms per key`} />
            </div>
            {!verdict.plausible ? (
              <p className="text-xs text-stone-600">
                That does not look like a barcode. If your scanner has a prefix or suffix configured (some add a
                letter or an asterisk), tell us the raw string above and it can be handled.
              </p>
            ) : null}
          </div>
        ) : null}
      </Card>

      <Card className="animate-fade-up">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle icon={<Usb size={16} />}>What this device can do</CardTitle>
          <Badge tone="brand" dot>{portal.capture.label}</Badge>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-stone-600">{portal.capture.what}</p>

        <div className="mt-4 space-y-2.5">
          {rows.map((row) => (
            <div key={row.key} className="flex items-start gap-3 rounded-2xl border border-stone-200 bg-stone-50 p-3.5">
              <span
                className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
                  row.ready === true
                    ? 'bg-emerald-500/10 text-emerald-700'
                    : row.ready === false
                      ? 'bg-amber-500/10 text-amber-700'
                      : 'bg-stone-100 text-stone-500'
                }`}
              >
                {row.icon}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-stone-800">{row.label}</p>
                  {row.ready === true ? (
                    <Badge tone="emerald" dot>Ready here</Badge>
                  ) : row.ready === false ? (
                    <Badge tone="amber">
                      <XCircle size={11} /> Not on this device
                    </Badge>
                  ) : (
                    <Badge tone="slate">Checking…</Badge>
                  )}
                </div>
                <p className="mt-0.5 text-xs leading-relaxed text-stone-600">{row.note}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 rounded-2xl border border-stone-200 bg-white p-3.5">
          <p className="text-xs font-bold uppercase tracking-wide text-stone-500">Formats the counter reads</p>
          <p className="mt-1.5 flex flex-wrap gap-1.5">
            {COUNTER_FORMATS.map((format) => (
              <span key={format} className="rounded-full bg-stone-100 px-2.5 py-1 font-mono text-[10px] font-semibold text-stone-600">
                {formatLabel(format)}
              </span>
            ))}
          </p>
          <p className="mt-2 text-[11px] leading-relaxed text-stone-500">
            A handheld scanner sends whatever the label carries, so all of these work with no configuration. Camera
            scanning uses the formats this browser supports — {readiness?.onDeviceDecoder.available ? 'which includes the retail ones on this device' : 'which this browser does not provide'}.
          </p>
        </div>

        <p className="mt-4 flex items-start gap-2 text-[11px] leading-relaxed text-stone-500">
          <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-emerald-600" />
          Nothing on this page uploads anything: the camera frame is decoded on the device, and the fingerprint is
          matched inside the sensor — DukaanOS receives a credential id and nothing else.
        </p>
      </Card>
    </div>
  );
}

function Detail({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-3">
      <p className="text-[11px] font-bold uppercase tracking-wide text-stone-500">{label}</p>
      <p className={`mt-1 text-sm text-stone-800 ${mono ? 'break-all font-mono' : ''}`}>{value}</p>
    </div>
  );
}

export { CHANNEL_LABEL };
