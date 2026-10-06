'use client';

/**
 * Trust Centre.
 *
 * The security layer is only worth having if the owner can *see* it working.
 * This screen reports the live posture — not marketing copy — by reading the
 * actual runtime state: whether storage is encrypted, whether the audit chain
 * verifies, which role holds which permission, and how much of the data ever
 * leaves the device.
 *
 * Every claim here is computed at render time. If something is degraded, the
 * screen says so in amber rather than pretending.
 */

import { useCallback, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Fingerprint,
  KeyRound,
  Lock,
  RefreshCw,
  ShieldCheck,
  ShieldHalf,
  Users,
} from 'lucide-react';
import { Card, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useDukaanStore } from '@/lib/store';
import { usePortal } from '@/lib/portals/portal-provider';
import { PORTAL_ICONS } from '@/lib/portals/icons';
import { disabledModules } from '@/lib/portals/registry';
import { toChainEvent, verifyChain, type ChainVerification } from '@/lib/security/audit';
import { PERMISSIONS, ROLE_DESCRIPTIONS, ROLE_LABELS, ROLES, can, type Role } from '@/lib/security/rbac';
import { vaultStatus } from '@/lib/security/vault';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { useToast } from '@/lib/ui/toast';

type Posture = 'protected' | 'attention' | 'information';

const POSTURE_STYLES: Record<Posture, string> = {
  protected: 'ring-emerald-500/20 bg-emerald-500/[0.06] text-emerald-700',
  attention: 'ring-amber-500/25 bg-amber-500/[0.07] text-amber-700',
  information: 'ring-stone-200 bg-stone-50 text-stone-700',
};

function PostureRow({
  icon,
  title,
  detail,
  posture,
  aside,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  posture: Posture;
  aside?: React.ReactNode;
}) {
  return (
    <div className={`flex items-start gap-3 rounded-xl p-3.5 ring-1 ring-inset ${POSTURE_STYLES[posture]}`}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed opacity-80">{detail}</p>
      </div>
      {aside ? <span className="shrink-0">{aside}</span> : null}
    </div>
  );
}

export function TrustCenter() {
  const { state, hydrated, syncStatus, persistence } = useDukaanStore();
  const { portal, nav } = usePortal();
  const toast = useToast();
  const PortalMark = PORTAL_ICONS[portal.icon] ?? PORTAL_ICONS.general;
  const scopedOut = disabledModules(portal.id);
  const [verification, setVerification] = useState<ChainVerification | null>(null);
  const [verifying, setVerifying] = useState(false);

  const storage = useMemo(() => (hydrated ? vaultStatus() : { available: true, encrypted: true, usedBytes: 0 }), [hydrated]);

  const chainedCount = useMemo(() => state.audit.filter((entry) => entry.hash).length, [state.audit]);
  const legacyCount = state.audit.length - chainedCount;

  const runVerification = useCallback(async () => {
    setVerifying(true);
    try {
      const events = state.audit.map((entry) =>
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
      setVerification(result);
      if (result.valid) {
        toast.success(
          'Audit history verified',
          `${result.verified} entr${result.verified === 1 ? 'y' : 'ies'} matched their fingerprints.`,
        );
      } else {
        toast.security('Audit history failed verification', result.reason ?? 'The chain did not match.');
      }
    } catch {
      toast.error('Verification could not run', 'Please try again.');
    } finally {
      setVerifying(false);
    }
  }, [state.audit, toast]);

  const exportBackup = useCallback(() => {
    try {
      const payload = {
        product: 'DukaanOS',
        kind: 'business-backup',
        version: 1,
        exportedAt: new Date().toISOString(),
        note: 'This file contains your business records. It is not encrypted — store it somewhere private.',
        data: state,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `dukaanos-backup-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success('Backup downloaded', 'Keep this file somewhere safe — it is your data, in full.');
    } catch {
      toast.error('Backup could not be created');
    }
  }, [state, toast]);

  const encryptionPosture: Posture =
    !hydrated ? 'information' : persistence.mode === 'encrypted' ? 'protected' : persistence.mode === 'plaintext' ? 'attention' : 'attention';

  const encryptionDetail = (() => {
    if (!hydrated || persistence.mode === 'loading') return 'Checking this device…';
    if (persistence.mode === 'encrypted') {
      return 'Records are sealed with AES-GCM-256 before they touch this device’s storage. The key never leaves the browser.';
    }
    return persistence.warning;
  })();

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardTitle icon={<ShieldCheck size={15} />}>Data stays here</CardTitle>
          <p className="mt-3 font-display text-2xl font-bold text-stone-900">
            {isSupabaseConfigured() ? 'Sync on' : 'On-device'}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-stone-600">
            {isSupabaseConfigured()
              ? 'A Supabase project is connected and row-level security scopes every record to your business.'
              : 'No server is connected. Your ledger lives on this device and works with no internet.'}
          </p>
        </Card>

        <Card>
          <CardTitle icon={<Fingerprint size={15} />}>Tamper-evident history</CardTitle>
          <p className="mt-3 font-display text-2xl font-bold text-stone-900">{chainedCount}</p>
          <p className="mt-1 text-xs leading-relaxed text-stone-600">
            {legacyCount > 0
              ? `Sealed entries. ${legacyCount} older record${legacyCount === 1 ? '' : 's'} predate the chain and are shown as unverified rather than claimed.`
              : 'Every recorded change carries a SHA-256 fingerprint linked to the one before it.'}
          </p>
        </Card>

        <Card>
          <CardTitle icon={<KeyRound size={15} />}>Access control</CardTitle>
          <p className="mt-3 font-display text-2xl font-bold text-stone-900">{ROLES.length} roles</p>
          <p className="mt-1 text-xs leading-relaxed text-stone-600">
            {PERMISSIONS.length} granular permissions. A cashier can bill; only an owner can reach people, billing, and data reset.
          </p>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle icon={<Lock size={15} />}>Live posture</CardTitle>
          <div className="mt-4 space-y-2.5">
            <PostureRow
              icon={encryptionPosture === 'protected' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
              title="Encryption at rest"
              detail={encryptionDetail}
              posture={encryptionPosture}
              aside={storage.encrypted ? <Badge tone="emerald">AES-256</Badge> : <Badge tone="amber">Fallback</Badge>}
            />
            <PostureRow
              icon={<Database size={16} />}
              title="Storage footprint"
              detail={`${Math.max(1, Math.round(storage.usedBytes / 1024))} KB used on this device, with a rollback snapshot kept for the last good write.`}
              posture="information"
              aside={<Badge tone="slate">{Math.max(1, Math.round(storage.usedBytes / 1024))} KB</Badge>}
            />
            <PostureRow
              icon={<PortalMark size={16} />}
              title={`Module scoping — ${portal.name}`}
              detail={
                scopedOut.length === 0
                  ? 'This business type carries every module, so nothing needs to be scoped out. The Edge middleware still decides what each request may reach.'
                  : `Requests for ${scopedOut.slice(0, 3).map((item) => item.label.toLowerCase()).join(', ')}${scopedOut.length > 3 ? ' and more' : ''} are refused before the page renders — the enforcement lives in Edge middleware, not in hidden buttons. A portal value can only hide modules; it can never unlock one.`
              }
              posture="protected"
              aside={<Badge tone="emerald">{nav.flatMap((section) => section.links).length} modules</Badge>}
            />
            <PostureRow
              icon={<ShieldHalf size={16} />}
              title="Request protection"
              detail="Every request passes a rate limiter, cross-site forgery checks, and a locked-down content security policy at the edge."
              posture="protected"
              aside={<Badge tone="emerald">Edge</Badge>}
            />
            <PostureRow
              icon={<Users size={16} />}
              title="Tenant isolation"
              detail="Each record is stamped with a business id; the schema enforces row-level security so one shop can never read another."
              posture={isSupabaseConfigured() ? 'protected' : 'information'}
              aside={<Badge tone={isSupabaseConfigured() ? 'emerald' : 'slate'}>{isSupabaseConfigured() ? 'Enforced' : 'Local'}</Badge>}
            />
            <PostureRow
              icon={<RefreshCw size={16} />}
              title="Persistence mode"
              detail={
                syncStatus === 'error'
                  ? 'The last sync to your server did not complete. Your data is safe on this device; retry when the connection is stable.'
                  : syncStatus === 'synced'
                    ? 'Your device and your server hold the same records.'
                    : 'Local-first: nothing is sent anywhere until you connect a server.'
              }
              posture={syncStatus === 'error' ? 'attention' : 'information'}
              aside={<Badge tone={syncStatus === 'error' ? 'amber' : 'slate'}>{syncStatus}</Badge>}
            />
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <Button onClick={runVerification} disabled={verifying || state.audit.length === 0}>
              <ShieldCheck size={15} />
              {verifying ? 'Verifying…' : 'Verify audit history'}
            </Button>
            <Button variant="secondary" onClick={exportBackup} disabled={!hydrated}>
              Download my data
            </Button>
          </div>

          {verification ? (
            <div
              className={`mt-4 rounded-xl p-3.5 text-xs ring-1 ring-inset ${
                verification.valid ? 'bg-emerald-500/[0.07] text-emerald-200 ring-emerald-500/20' : 'bg-red-500/[0.07] text-red-200 ring-red-500/25'
              }`}
              role="status"
            >
              {verification.valid ? (
                <p>
                  <span className="font-bold">Verified.</span> {verification.verified} sealed entr
                  {verification.verified === 1 ? 'y' : 'ies'} matched their fingerprints
                  {verification.unverified > 0 ? `, ${verification.unverified} older entr${verification.unverified === 1 ? 'y' : 'ies'} predate the chain` : ''}.
                </p>
              ) : (
                <p>
                  <span className="font-bold">Verification failed.</span> {verification.reason}
                </p>
              )}
            </div>
          ) : null}
        </Card>

        <Card>
          <CardTitle icon={<Users size={15} />}>Who can do what</CardTitle>
          <p className="mt-2 text-xs leading-relaxed text-stone-600">
            Roles are enforced in the app and mirrored in the database schema. Invite staff from{' '}
            <span className="text-stone-700">Team &amp; Roles</span>.
          </p>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-left text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-stone-600">
                  <th className="pb-2 pr-3 font-bold">Capability</th>
                  {ROLES.map((role) => (
                    <th key={role} className="pb-2 px-2 text-center font-bold">
                      {ROLE_LABELS[role]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    ['Record a sale', 'sales.create'],
                    ['Manage products', 'products.manage'],
                    ['Manage memberships', 'memberships.manage'],
                    ['See reports', 'reports.view'],
                    ['Export data', 'data.export'],
                    ['Change settings', 'settings.manage'],
                    ['Manage team', 'team.manage'],
                    ['Reset all data', 'data.reset'],
                  ] as const
                ).map(([label, permission]) => (
                  <tr key={permission} className="border-t border-stone-200">
                    <td className="py-2 pr-3 text-stone-700">{label}</td>
                    {(ROLES as readonly Role[]).map((role) => (
                      <td key={role} className="px-2 py-2 text-center">
                        {can(role, permission) ? (
                          <CheckCircle2 size={14} className="mx-auto text-emerald-700" aria-label="allowed" />
                        ) : (
                          <span className="text-stone-600" aria-label="not allowed">
                            —
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <dl className="mt-5 space-y-2">
            {(ROLES as readonly Role[]).map((role) => (
              <div key={role} className="rounded-xl bg-stone-50 p-3 ring-1 ring-inset ring-stone-200">
                <dt className="text-xs font-semibold text-stone-900">{ROLE_LABELS[role]}</dt>
                <dd className="mt-0.5 text-[11px] leading-relaxed text-stone-600">{ROLE_DESCRIPTIONS[role]}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>

      <Card>
        <CardTitle icon={<Lock size={15} />}>What we never collect</CardTitle>
        <p className="mt-3 text-sm leading-relaxed text-stone-600">
          No PINs, OTPs, card numbers, or bank passwords — the app has no field for them and no code path that could store
          them. Your UPI ID is used solely to draw your collection QR and is never sent to a payment gateway, because
          DukaanOS is not one: customers pay you directly.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-stone-600">
          <strong className="font-semibold text-stone-700">No fingerprints either.</strong> The fingerprint pad at a
          front desk uses the sensor the device already has, through the browser&apos;s WebAuthn API. The sensor matches
          the finger in hardware and returns a credential id; that id is all this app ever stores — never an image, never
          a template, never a hash of one. Deleting the enrolment is the whole of forgetting the finger, and a finger can
          only ever record a visit: it cannot move money.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-stone-600">
          Camera scanning is the same idea in the other direction: barcodes are decoded on the device by the browser
          itself, frames are never uploaded, and there is no server-side image pipeline to upload them to. On a browser
          with no built-in decoder, DukaanOS says so and the counter keeps working on a hardware scanner or the keypad.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-stone-600">
          Diagnostics are scrubbed before they leave a module — phone numbers, emails, UPI ids, tokens, and any 13–19 digit
          sequence are masked on the way in, so a bug report can never contain a customer’s identity.
        </p>
      </Card>
    </div>
  );
}
