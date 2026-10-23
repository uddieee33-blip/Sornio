'use client';
import { useRef, useState } from 'react';
import { useDukaanStore, type StoreState } from '@/lib/store';
import { vaultRead } from '@/lib/security/vault';
import { useOwnerGate } from './owner-gate';
import { runExport } from '@/lib/export/download';
/** Legacy data is adopted only after the signed-in owner explicitly claims it. */
export function BackupRecovery() {
  const { state, actions, identity } = useDukaanStore();
  const { requestOwner, modal } = useOwnerGate();
  const input = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState('');
  if (identity?.role !== 'owner' || state.demoMode) return null;
  const restore = (backup: StoreState) => {
    const result = actions.restoreBackup(backup);
    setMessage(
      result.ok
        ? 'Backup restored into this business. Sync will preserve a cloud copy.'
        : (result.error ?? 'Could not restore backup.'),
    );
  };
  return (
    <section className="my-6 rounded-2xl border p-5">
      <h2 className="font-semibold">Backup and recovery</h2>
      <p className="mt-2 text-sm">
        Restore only into an empty business. Keep an exported backup before making changes.
      </p>
      <div className="mt-3 flex flex-wrap gap-3">
        <button
          className="rounded-xl border px-4 py-2"
          onClick={() => {
            runExport(state, 'everything');
          }}
        >
          Export full backup
        </button>
        <button
          className="rounded-xl border px-4 py-2"
          onClick={() =>
            requestOwner('Confirm ownership before restoring business records.', () => input.current?.click())
          }
        >
          Import backup
        </button>
        <button
          className="rounded-xl border px-4 py-2"
          onClick={() =>
            requestOwner(
              'Confirm that the records from the previous version belong to this signed-in business.',
              () => {
                if (
                  !window.confirm(
                    'Only restore the previous records if they belong to this signed-in business. Continue?',
                  )
                )
                  return;
                void vaultRead<StoreState>('dukaanos-store-v5').then((result) =>
                  result.ok ? restore(result.data) : setMessage(result.error),
                );
              },
            )
          }
        >
          Recover previous version
        </button>
      </div>
      <input
        ref={input}
        type="file"
        accept="application/json,.json"
        className="sr-only"
        aria-label="Import business backup"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          if (file.size > 32 * 1024 * 1024) {
            setMessage('This backup is too large.');
            return;
          }
          try {
            const parsed = JSON.parse(await file.text());
            if (parsed.product !== 'DukaanOS' || parsed.kind !== 'business-backup') throw new Error();
            restore(parsed.data);
          } catch {
            setMessage('This is not a valid DukaanOS backup.');
          }
          e.target.value = '';
        }}
      />
      {message ? (
        <p role="status" className="mt-3 text-sm">
          {message}
        </p>
      ) : null}
      {modal}
    </section>
  );
}
