'use client';

/**
 * The barcode scanner, in every form a shop actually owns one.
 *
 * Three channels, one component, one callback:
 *
 *   1. **Hardware scanner (keyboard wedge).** A ₹800 USB or Bluetooth scanner is
 *      a keyboard that types very fast and presses Enter. So the field below is
 *      always listening, and a scan is told apart from typing by *speed*: a
 *      wedge delivers a whole code in a few milliseconds, a person does not.
 *      This is the channel most shops already have, and it never needs pairing,
 *      permissions, or a network.
 *   2. **Camera.** Where the browser ships its own decoder (`BarcodeDetector`),
 *      the phone or tablet becomes a scanner with no image ever leaving the
 *      device. Where it does not, the tab says so instead of pretending, and
 *      the wedge and the keypad still work.
 *   3. **Typed.** For the label that is torn, smudged, or on the last packet in
 *      a crushed carton. Every typed code goes through the same check-digit
 *      validation as a scanned one, so a typo is caught, not billed.
 *
 * Feedback is deliberately physical — a beep and a buzz — because at a counter
 * the cashier is looking at the customer, not the screen.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Camera, CameraOff, Keyboard, ScanBarcode, Usb, Volume2, VolumeX } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { detectCaptureReadiness, formatLabel, COUNTER_FORMATS } from '@/lib/scanning/device';
import { describeCode, looksLikeCode } from '@/lib/scanning/barcodes';
import type { CaptureReadiness, ScanSource } from '@/lib/scanning/types';

/** A code delivered to the caller, with where it came from. */
export type ScannerRead = { code: string; source: ScanSource; symbology?: string };

type BarcodeDetectorLike = { detect: (source: HTMLVideoElement) => Promise<{ rawValue: string; format: string }[]> };
type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorLike;

/** A wedge types faster than a person can; anything under this is a machine. */
const WEDGE_GAP_MS = 28;
/** The same packet must not be billed twice by a camera that keeps seeing it. */
const CAMERA_DEDUPE_MS = 1600;

function detectorCtor(): BarcodeDetectorCtor | null {
  if (typeof window === 'undefined') return null;
  const candidate = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
  return typeof candidate === 'function' ? candidate : null;
}

/** A short counter beep. Never autoplays: it exists to confirm a read. */
function beep(kind: 'ok' | 'ignored', enabled: boolean) {
  if (!enabled) return;
  try {
    const Ctx = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext });
    const AudioCtor = Ctx.AudioContext ?? Ctx.webkitAudioContext;
    if (!AudioCtor) return;
    const context = new AudioCtor();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'square';
    oscillator.frequency.value = kind === 'ok' ? 1180 : 320;
    gain.gain.value = 0.045;
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    window.setTimeout(() => {
      oscillator.stop();
      void context.close();
    }, kind === 'ok' ? 70 : 110);
  } catch {
    // A silent counter is still a working counter.
  }
}

function buzz(enabled: boolean) {
  if (!enabled) return;
  try {
    navigator.vibrate?.(28);
  } catch {
    // Not every device has a motor.
  }
}

export function BarcodeScanner({
  onRead,
  /** Names the place the read happened, for the scan log. */
  label = 'Counter',
  /** Focus the field on mount — true at a billing counter, off for a sub-form. */
  autoFocus = true,
  disabled = false,
  /** Called instead of onRead when the read is not a plausible code. */
  onIgnored,
}: {
  onRead: (read: ScannerRead) => void;
  label?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  onIgnored?: (reason: string) => void;
}) {
  const [mode, setMode] = useState<'wedge' | 'camera'>('wedge');
  const [draft, setDraft] = useState('');
  const [last, setLast] = useState<{ code: string; source: ScanSource; note: string } | null>(null);
  const [sound, setSound] = useState(true);
  const [readiness, setReadiness] = useState<CaptureReadiness | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  /** Keystroke timestamps, used to tell a wedge from a person. */
  const timing = useRef<number[]>([]);
  const lastCameraCode = useRef<{ code: string; at: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    detectCaptureReadiness()
      .then((result) => {
        if (!cancelled) setReadiness(result);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const deliver = useCallback(
    (code: string, source: ScanSource, symbology?: string) => {
      const trimmed = code.trim();
      if (!looksLikeCode(trimmed)) {
        beep('ignored', sound);
        onIgnored?.('That does not look like a barcode. Scan again, or type at least three characters.');
        return false;
      }
      const profile = describeCode(trimmed);
      setLast({ code: profile.code, source, note: profile.note });
      beep('ok', sound);
      buzz(sound);
      onRead({ code: profile.code, source, symbology: symbology ?? profile.symbology });
      return true;
    },
    [onIgnored, onRead, sound],
  );

  const commit = useCallback(() => {
    const value = draft.trim();
    if (!value) return;
    // A wedge delivers the code in one fast burst; a person is far slower. That
    // single measurement is the difference between "scanned" and "typed", and it
    // is recorded in the scan log, because it changes who to trust for a typo.
    const stamps = timing.current;
    const burst = stamps.length > 1 && stamps[stamps.length - 1] - stamps[0] < WEDGE_GAP_MS * stamps.length;
    timing.current = [];
    setDraft('');
    const delivered = deliver(value, burst ? 'wedge' : 'manual');
    if (!delivered) setDraft(value);
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus, deliver, draft]);

  // Camera loop. Started only when the owner asks for it, stopped the moment
  // they leave the tab — a shop's camera light must never stay on by accident.
  useEffect(() => {
    if (mode !== 'camera' || disabled) return;
    const Detector = detectorCtor();
    const video = videoRef.current;
    if (!Detector || !video) {
      setCameraError(
        readiness?.onDeviceDecoder.reason ??
          'This browser cannot decode barcodes from the camera. Use a hardware scanner, or type the code.',
      );
      return;
    }

    let stream: MediaStream | null = null;
    let timer: number | null = null;
    let busy = false;
    let cancelled = false;
    const detector = new Detector({ formats: [...COUNTER_FORMATS] });

    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        video.srcObject = stream;
        video.setAttribute('playsinline', 'true');
        await video.play();
        setCameraError(null);

        timer = window.setInterval(async () => {
          if (busy || cancelled || video.readyState < 2) return;
          busy = true;
          try {
            const results = await detector.detect(video);
            const hit = results.find((result) => result.rawValue?.trim());
            if (hit) {
              const now = Date.now();
              const previous = lastCameraCode.current;
              // A camera sees the same packet 5 times a second; bill it once.
              if (!previous || previous.code !== hit.rawValue || now - previous.at > CAMERA_DEDUPE_MS) {
                lastCameraCode.current = { code: hit.rawValue, at: now };
                deliver(hit.rawValue, 'camera', formatLabel(hit.format));
              }
            }
          } catch {
            // A dropped frame is not an error worth interrupting the counter for.
          } finally {
            busy = false;
          }
        }, 220);
      } catch (error) {
        const name = error instanceof DOMException ? error.name : '';
        setCameraError(
          name === 'NotAllowedError'
            ? 'Camera permission was refused. Allow it in the browser, or use a hardware scanner.'
            : 'The camera could not be opened on this device. A hardware scanner and typing both still work.',
        );
      }
    };

    void start();

    return () => {
      cancelled = true;
      if (timer !== null) window.clearInterval(timer);
      stream?.getTracks().forEach((track) => track.stop());
      if (video) video.srcObject = null;
    };
  }, [mode, disabled, deliver, readiness?.onDeviceDecoder.reason]);

  const cameraUsable = readiness?.camera.available && readiness?.onDeviceDecoder.available;
  const modeButtons = useMemo(
    () => [
      { id: 'wedge' as const, label: 'Hardware scanner', icon: Usb },
      { id: 'camera' as const, label: 'Camera', icon: Camera },
    ],
    [],
  );

  return (
    <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-portal/10 text-portal ring-1 ring-inset ring-portal/20">
            <ScanBarcode size={16} />
          </span>
          <div>
            <p className="text-sm font-bold text-stone-900">{label}</p>
            <p className="text-[11px] text-stone-600">Scan, or type the number printed under the bars.</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {modeButtons.map((button) => {
            const Icon = button.icon;
            const active = mode === button.id;
            return (
              <button
                key={button.id}
                type="button"
                onClick={() => setMode(button.id)}
                aria-pressed={active}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-bold ring-1 ring-inset transition ${
                  active ? 'bg-portal text-white ring-portal' : 'bg-white text-stone-600 ring-stone-200 hover:text-stone-900'
                }`}
              >
                <Icon size={12} /> {button.label}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setSound((current) => !current)}
            aria-pressed={sound}
            title={sound ? 'Beep on every read' : 'Silent'}
            className="rounded-lg bg-white p-1.5 text-stone-600 ring-1 ring-inset ring-stone-200 transition hover:text-stone-900"
          >
            {sound ? <Volume2 size={13} /> : <VolumeX size={13} />}
          </button>
        </div>
      </div>

      {mode === 'camera' ? (
        <div className="space-y-2">
          <div className="relative overflow-hidden rounded-xl bg-stone-900 ring-1 ring-inset ring-stone-300">
            <video ref={videoRef} muted className="h-52 w-full object-cover" />
            <div className="pointer-events-none absolute inset-x-6 top-1/2 h-24 -translate-y-1/2 rounded-lg border-2 border-white/70" />
            {cameraError ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-stone-900/90 p-4 text-center">
                <CameraOff size={20} className="text-amber-300" />
                <p className="max-w-xs text-[11px] leading-relaxed text-stone-100">{cameraError}</p>
              </div>
            ) : null}
          </div>
          <p className="text-[11px] leading-relaxed text-stone-600">
            {readiness?.onDeviceDecoder.available
              ? 'Held steady, the camera reads a retail barcode in about a fifth of a second. Frames are decoded on this device and never uploaded.'
              : readiness?.onDeviceDecoder.reason ?? 'Checking this device…'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="relative">
            <Keyboard size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-500" />
            <input
              ref={inputRef}
              value={draft}
              disabled={disabled}
              autoFocus={autoFocus}
              inputMode="text"
              autoComplete="off"
              spellCheck={false}
              // The wedge IS a keyboard: it needs a plain, always-listening field.
              onChange={(event) => {
                timing.current = [...timing.current.slice(-24), Date.now()];
                setDraft(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  commit();
                } else if (event.key === 'Escape') {
                  setDraft('');
                  timing.current = [];
                }
              }}
              placeholder="Scan a packet, or type the code…"
              aria-label="Barcode"
              className="w-full rounded-xl border border-stone-200 bg-white pl-9 pr-3 py-3 font-mono text-sm tracking-wide text-stone-900 placeholder-stone-400 outline-hidden transition focus:border-portal/50 focus:ring-2 focus:ring-focus"
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] leading-relaxed text-stone-600">
              {readiness?.wedge.note ?? 'A USB or Bluetooth scanner types straight into this field.'}
            </p>
            <button
              type="button"
              onClick={commit}
              disabled={disabled || !draft.trim()}
              className="touch-manipulation min-h-11 shrink-0 rounded-lg bg-portal-gradient px-3 py-1.5 text-[11px] font-bold text-white shadow-glow-sm transition hover:brightness-110 disabled:opacity-40"
            >
              Read it
            </button>
          </div>
        </div>
      )}

      {cameraUsable === false && mode === 'wedge' ? (
        <p className="mt-2 rounded-lg bg-white px-3 py-2 text-[11px] leading-relaxed text-stone-600 ring-1 ring-inset ring-stone-200">
          Camera scanning is off on this device: {readiness?.camera.reason ?? readiness?.onDeviceDecoder.reason ?? 'not available.'}
        </p>
      ) : null}

      {last ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-white px-3 py-2 ring-1 ring-inset ring-stone-200">
          <Badge tone="emerald" dot>
            {last.source === 'wedge' ? 'Scanned' : last.source === 'camera' ? 'Camera read' : 'Typed'}
          </Badge>
          <span className="font-mono text-xs font-semibold text-stone-900">{last.code}</span>
          <span className="text-[11px] text-stone-600">{last.note}</span>
        </div>
      ) : null}
    </div>
  );
}
