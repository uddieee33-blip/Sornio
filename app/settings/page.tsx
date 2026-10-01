export default function SettingsPage() {
  return (
    <div className="p-6 md:p-8">
      <h1 className="text-3xl font-bold text-slate-900">Settings</h1>
      <p className="mt-2 text-slate-600">Team roles, permissions, compliance settings, and audit configuration.</p>

      <div className="mt-8 grid gap-6 xl:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
          <h2 className="text-lg font-semibold text-slate-900">Roles</h2>
          <ul className="mt-4 space-y-2 text-sm text-slate-600">
            <li>• Owner</li>
            <li>• Manager</li>
            <li>• Accountant</li>
            <li>• Staff</li>
            <li>• Viewer</li>
          </ul>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
          <h2 className="text-lg font-semibold text-slate-900">Audit history</h2>
          <ul className="mt-4 space-y-2 text-sm text-slate-600">
            <li>• Sales recorded</li>
            <li>• Expenses posted</li>
            <li>• Refunds tracked</li>
            <li>• Stock adjustments logged</li>
            <li>• Transfers reviewed</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
