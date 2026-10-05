'use client';

import { Check, Minus, ShieldCheck, Users } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

type Capability = 'View dashboards' | 'Record sales' | 'Record expenses' | 'Manage products' | 'Manage members' | 'Raise invoices' | 'Manage settings' | 'Invite team' | 'Reset data';

const roles: { name: string; description: string; grants: Capability[] }[] = [
  { name: 'Owner', description: 'Full control of the business, finances, and team.', grants: ['View dashboards', 'Record sales', 'Record expenses', 'Manage products', 'Manage members', 'Raise invoices', 'Manage settings', 'Invite team', 'Reset data'] },
  { name: 'Manager', description: 'Runs daily operations without touching ownership settings.', grants: ['View dashboards', 'Record sales', 'Record expenses', 'Manage products', 'Manage members', 'Raise invoices'] },
  { name: 'Accountant', description: 'Sees the money: reports, expenses, and reconciliation.', grants: ['View dashboards', 'Record expenses', 'Raise invoices'] },
  { name: 'Staff', description: 'Front-desk: billing and catalog only.', grants: ['View dashboards', 'Record sales'] },
  { name: 'Viewer', description: 'Read-only visibility for partners or investors.', grants: ['View dashboards'] },
];

const capabilities: Capability[] = ['View dashboards', 'Record sales', 'Record expenses', 'Manage products', 'Manage members', 'Raise invoices', 'Manage settings', 'Invite team', 'Reset data'];

export default function TeamPage() {
  return (
    <div className="mx-auto max-w-6xl p-6 md:p-8">
      <PageHeader
        eyebrow="People"
        title="Team Roles & Permissions"
        subtitle="Role-based access for when you invite your team — Supabase Auth maps each teammate to exactly one role."
        actions={<Badge tone="brand" dot>{roles.length} roles</Badge>}
      />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 animate-fade-up">
        {roles.map((role) => (
          <Card key={role.name} hover>
            <div className="flex items-center justify-between">
              <p className="font-display text-base font-bold text-stone-900">{role.name}</p>
              <Badge tone={role.name === 'Owner' ? 'brand' : role.name === 'Viewer' ? 'slate' : 'emerald'} dot>{role.grants.length} permissions</Badge>
            </div>
            <p className="mt-1.5 text-sm text-stone-600">{role.description}</p>
          </Card>
        ))}
      </div>

      <Card className="mt-6 animate-fade-up">
        <div className="mb-5 flex items-center justify-between">
          <CardTitle icon={<ShieldCheck size={17} />}>Permissions matrix</CardTitle>
          <Badge tone="slate" dot>Foundation — enforced via Supabase RLS in production</Badge>
        </div>
        <div className="overflow-x-auto rounded-2xl border border-stone-200">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-stone-50 text-[11px] uppercase tracking-wide text-stone-600">
              <tr>
                <th className="px-4 py-3 font-semibold">Capability</th>
                {roles.map((role) => <th key={role.name} className="px-4 py-3 text-center font-semibold">{role.name}</th>)}
              </tr>
            </thead>
            <tbody>
              {capabilities.map((capability) => (
                <tr key={capability} className="border-t border-stone-200 transition hover:bg-stone-50">
                  <td className="px-4 py-3 font-medium text-stone-700">{capability}</td>
                  {roles.map((role) => {
                    const granted = role.grants.includes(capability);
                    return (
                      <td key={role.name} className="px-4 py-3 text-center">
                        {granted ? <Check size={16} className="mx-auto text-emerald-700" /> : <Minus size={14} className="mx-auto text-stone-600" />}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 flex items-center gap-2 rounded-2xl border border-brand-500/20 bg-brand-500/[0.06] p-3.5 text-xs leading-relaxed text-brand-700">
          <Users size={14} className="shrink-0" />
          In this demo build roles are shown as configuration. With Supabase Auth connected, each invited teammate signs in and row-level security restricts every query to your business and their role.
        </p>
      </Card>
    </div>
  );
}
