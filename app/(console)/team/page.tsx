'use client';

/**
 * Team & roles.
 *
 * This screen renders the *enforced* permission matrix from
 * `lib/security/rbac.ts` — not a hand-written brochure. If the matrix changes,
 * this page changes with it, so an owner never reads a promise the app does not
 * keep.
 *
 * Two different questions live side by side, and the page is explicit about the
 * difference:
 *
 *   • **Portal** — which modules exist for this business type.
 *   • **Role** — who, inside those modules, may do what.
 */

import { Check, Minus, ShieldCheck, Store, Users } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { TeamManager } from '@/components/team/team-manager';
import { PERMISSION_LABELS, PERMISSIONS, ROLES, ROLE_DESCRIPTIONS, ROLE_LABELS, can } from '@/lib/security/rbac';
import { usePortal } from '@/lib/portals/portal-provider';
import { PORTAL_ICONS } from '@/lib/portals/icons';
import { disabledModules } from '@/lib/portals/registry';

export default function TeamPage() {
  const { portal, nav } = usePortal();
  const PortalMark = PORTAL_ICONS[portal.icon] ?? PORTAL_ICONS.general;
  const notCarried = disabledModules(portal.id);
  const carried = nav.flatMap((section) => section.links);

  // Driven by the engine's own list, so nothing can be added to one and missed
  // in the other.
  const permissionKeys = [...PERMISSIONS];

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6 md:p-8">
      <PageHeader
        eyebrow="People"
        title="Team Roles & Permissions"
        subtitle="Roles decide what a teammate may do; your business type decides which modules exist in the first place. Both are enforced — the client hides what a role cannot do, and the database refuses it."
        actions={<Badge tone="brand" dot>{ROLES.length} roles</Badge>}
      />

      {/* Who actually has a seat — the live roster, as the database sees it. */}
      <TeamManager />

      {/* What this console carries — the same list the sidebar shows. */}
      <Card className="mb-6 animate-fade-up">
        <div className="mb-4 flex items-center justify-between gap-3">
          <CardTitle icon={<PortalMark size={17} />}>Module scoping — {portal.name}</CardTitle>
          <Badge tone="brand" dot>
            {carried.length} of {carried.length + notCarried.length} modules
          </Badge>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {carried.map((link) => (
            <span
              key={link.href}
              className="inline-flex items-center gap-1.5 rounded-full bg-portal/10 px-2.5 py-1 text-[11px] font-semibold text-portal ring-1 ring-inset ring-portal/25"
            >
              <link.icon size={11} /> {link.label}
            </span>
          ))}
          {notCarried.map((item) => (
            <span
              key={item.module}
              className="rounded-full bg-stone-50 px-2.5 py-1 text-[11px] font-medium text-stone-400 ring-1 ring-inset ring-stone-200 line-through"
            >
              {item.label}
            </span>
          ))}
        </div>
        <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-stone-600">
          <Store size={13} className="mt-0.5 shrink-0 text-stone-500" />
          <span>
            A crossed-out module is not hidden from a role — it is not part of this business type at all, and a direct link to it is refused
            at the edge before the page renders. Roles below then apply *inside* the modules that remain.
          </span>
        </p>
      </Card>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 animate-fade-up">
        {ROLES.map((role) => {
          const grants = permissionKeys.filter((permission) => can(role, permission));
          return (
            <Card key={role} hover>
              <div className="flex items-center justify-between gap-2">
                <p className="font-display text-base font-bold text-stone-900">{ROLE_LABELS[role]}</p>
                <Badge tone={role === 'owner' ? 'brand' : role === 'auditor' ? 'slate' : 'emerald'} dot>
                  {grants.length} permissions
                </Badge>
              </div>
              <p className="mt-1.5 text-sm leading-relaxed text-stone-600">{ROLE_DESCRIPTIONS[role]}</p>
            </Card>
          );
        })}
      </div>

      <Card className="mt-6 animate-fade-up">
        <div className="mb-5 flex items-center justify-between">
          <CardTitle icon={<ShieldCheck size={17} />}>Permissions matrix</CardTitle>
          <Badge tone="slate" dot>
            Source of truth: lib/security/rbac.ts
          </Badge>
        </div>
        <div className="overflow-x-auto rounded-2xl border border-stone-200">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-stone-50 text-[11px] uppercase tracking-wide text-stone-600">
              <tr>
                <th className="px-4 py-3 font-semibold">Capability</th>
                {ROLES.map((role) => (
                  <th key={role} className="px-4 py-3 text-center font-semibold">
                    {ROLE_LABELS[role].replace(' (read-only)', '')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {permissionKeys.map((permission) => (
                <tr key={permission} className="border-t border-stone-200 transition hover:bg-stone-50">
                  <td className="px-4 py-3 font-medium text-stone-700">{PERMISSION_LABELS[permission]}</td>
                  {ROLES.map((role) => (
                    <td key={role} className="px-4 py-3 text-center">
                      {can(role, permission) ? (
                        <Check size={16} className="mx-auto text-emerald-700" />
                      ) : (
                        <Minus size={14} className="mx-auto text-stone-600" />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 flex items-center gap-2 rounded-2xl border border-brand-500/20 bg-brand-500/[0.06] p-3.5 text-xs leading-relaxed text-brand-700">
          <Users size={14} className="shrink-0" />
          With sync connected, the owner hands out roles from the console above: each invited teammate signs in with their own
          email, and row-level security restricts every query to your business. Without it, the same matrix is applied in the
          client on this device, and every change is written to the audit chain.
        </p>
      </Card>
    </div>
  );
}
