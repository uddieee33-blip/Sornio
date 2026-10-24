'use client';

/**
 * Capture readiness — what *this* device can actually do.
 *
 * The most common support question in a shop is "why is the scanner not
 * working?", and the honest answer is usually one of five things: the browser
 * has no camera, the site is not on HTTPS, the browser has no built-in barcode
 * decoder, the sensor is not on this machine, or the handheld scanner simply is
 * not plugged in. Rather than let an owner guess, this card asks the device and
 * says which channels are ready, which are not, and what still works.
 *
 * It is deliberately optimistic about nothing: a channel that cannot work here
 * is shown amber with the reason and the fallback, because a shop must be able
 * to bill on a plain Windows PC with a ₹700 USB scanner and nothing else.
 *
 * The detection runs once after mount (never during render) because it touches
 * `navigator`, and it never throws — see `lib/scanning/device.ts`.
 */

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Camera, Fingerprint, Keyboard, ScanBarcode, Usb } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Card, CardTitle } from '@/components/ui/Card';
import { usePortal } from '@/lib/portals/portal-provider';
import { detectCaptureReadiness, type CaptureChannel, type CaptureReadiness } from '@/lib/scanning';

const CHANNEL_LABEL: Record<CaptureChannel, string> = {
  barcode: 'Barcode scanner',
  qr: 'QR / job tags',
  keypad: 'Typed entry',
  fingerprint: 'Fingerprint pad',
};

type ReadinessRow = {
  key: string;
  icon: ReactNode;
  label: string;
  /** null while the device is still being asked. */
  ready: boolean | null;
  note: string;
};

export function CaptureReadinessCard() {
  const { portal } = usePortal();
  const [readiness, setReadiness] = useState<CaptureReadiness | null>(null);

  useEffect(() => {
    let cancelled = false;
    void detectCaptureReadiness().then((next) => {
      if (!cancelled) setReadiness(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const channels = portal.capture.channels;
  const rows: ReadinessRow[] = [];

  if (channels.includes('barcode')) {
    rows.push({
      key: 'wedge',
      icon: <Usb size={15} />,
      label: 'Handheld scanner (USB / Bluetooth)',
      ready: true,
      note:
        readiness?.wedge.note ??
        'A barcode scanner is a keyboard that types very fast — plug it in and it types into any code field. Nothing to install.',
    });
  }

  if (channels.includes('barcode') || channels.includes('qr')) {
    rows.push({
      key: 'camera',
      icon: <Camera size={15} />,
      label: channels.includes('barcode') ? 'Camera scanning' : 'Camera for QR tags',
      ready: readiness ? readiness.camera.available : null,
      note: readiness?.camera.available
        ? 'A phone or tablet camera can read the label when the handheld scanner is not to hand.'
        : readiness?.camera.reason ?? 'Asking this device…',
    });
    rows.push({
      key: 'decoder',
      icon: <ScanBarcode size={15} />,
      label: 'Decoding on this device',
      ready: readiness ? readiness.onDeviceDecoder.available : null,
      note: readiness?.onDeviceDecoder.available
        ? 'This browser decodes the barcode itself — the camera frame never leaves the device and is never uploaded.'
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
        ? 'The sensor on this device can open a member’s visit. The finger is matched in the sensor; Sornio only ever receives a credential id.'
        : readiness?.fingerprint.reason ?? 'Asking this device…',
    });
  }

  if (channels.includes('keypad') || rows.length === 0) {
    rows.push({
      key: 'keypad',
      icon: <Keyboard size={15} />,
      label: 'Typed entry',
      ready: true,
      note: 'Always available, on every device — the fallback that keeps the counter moving when a label is torn.',
    });
  }

  return (
    <Card className="animate-fade-up">
      <div className="mb-5 flex items-center justify-between gap-3">
        <CardTitle icon={<ScanBarcode size={17} />}>How this counter captures</CardTitle>
        <Badge tone="brand" dot>
          {portal.capture.label}
        </Badge>
      </div>

      <p className="text-sm leading-relaxed text-stone-600">{portal.capture.what}</p>

      {/* Frames get the camera only if the app that embedded them said so, and
          most do not. Named here, on every screen the card appears on, so an
          owner never reads "camera blocked" as "the software is broken". */}
      {readiness?.embedded ? (
        <p className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/[0.07] p-3 text-xs leading-relaxed text-amber-900">
          This page is inside another app&apos;s frame, which is not allowed to open the camera. Your handheld scanner and
          typed entry work here — open Sornio in its own tab for camera scans.
        </p>
      ) : null}
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {channels.map((channel) => (
          <span
            key={channel}
            className="rounded-full bg-portal/[0.08] px-2.5 py-1 text-[11px] font-semibold text-portal ring-1 ring-inset ring-portal/20"
          >
            {CHANNEL_LABEL[channel]}
          </span>
        ))}
      </div>
      {portal.capture.symbologies.length > 0 ? (
        <p className="mt-2 font-mono text-[10px] leading-relaxed text-stone-500">
          {portal.capture.symbologies.join(' · ')}
        </p>
      ) : null}
      <p className="mt-3 text-xs leading-relaxed text-stone-500">{portal.capture.note}</p>

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
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-stone-800">{row.label}</p>
                {row.ready === true ? (
                  <Badge tone="emerald" dot>
                    Ready here
                  </Badge>
                ) : row.ready === false ? (
                  <Badge tone="amber">Not on this device</Badge>
                ) : (
                  <Badge tone="slate">Checking…</Badge>
                )}
              </div>
              <p className="mt-0.5 text-xs leading-relaxed text-stone-600">{row.note}</p>
            </div>
          </div>
        ))}
      </div>

      {portal.capture.jobs.length > 0 ? (
        <>
          <p className="mt-4 text-[11px] font-bold uppercase tracking-wide text-stone-500">Where it is put to work</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {portal.capture.jobs.map((job) => (
              <Link
                key={`${job.href}-${job.label}`}
                href={job.href}
                className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-stone-700 ring-1 ring-inset ring-stone-200 transition hover:bg-stone-100"
              >
                {job.label} →
              </Link>
            ))}
          </div>
        </>
      ) : null}

      <p className="mt-4 text-[11px] leading-relaxed text-stone-500">
        Sornio has no server-side image pipeline: a camera read is decoded by this browser. Fingerprints are matched inside the
        sensor and never stored — only a credential id is.{' '}
        <Link href="/security" className="font-semibold text-stone-600 underline underline-offset-4">
          More in the Trust Centre
        </Link>
        .
      </p>
    </Card>
  );
}
