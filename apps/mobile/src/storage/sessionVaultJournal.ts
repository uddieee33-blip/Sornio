/** Non-secret restart intent for the demo session vault.
 *
 * Keychain deletion can reject after an earlier session was durably written. A
 * per-process memory fallback alone cannot protect the *next* process from that
 * stale native record. This journal contains no credential, token or business
 * data. An `active` intent names the exact vault grant that may be restored; a
 * native record with any other grant is ignored. Missing/corrupt intent fails
 * closed. Operational outboxes never use this journal: they require the native
 * encrypted store and still throw on any failure.
 */
export type VaultIntent = { state: 'signed-out' } | { state: 'active'; grant: string };
export type VaultJournal = {
  read: () => Promise<VaultIntent | null>;
  write: (intent: VaultIntent) => Promise<void>;
};
export function defaultVaultJournal(): VaultJournal | null {
  try {
    // Legacy API is supported by the installed Expo 58 runtime. The marker is
    // intentionally outside SecureStore so a Keychain delete denial cannot also
    // erase the sign-out intent.
    const fs = require('expo-file-system/legacy') as typeof import('expo-file-system/legacy');
    const directory = fs.documentDirectory;
    if (!directory) return null;
    const uri = `${directory}sornio-session-vault-intent.json`;
    return {
      async read() {
        const info = await fs.getInfoAsync(uri);
        if (!info.exists) return null;
        try {
          const value: unknown = JSON.parse(await fs.readAsStringAsync(uri));
          if (typeof value === 'object' && value !== null && 'version' in value && value.version === 1 && 'state' in value) {
            if (value.state === 'signed-out') return { state: 'signed-out' };
            if (value.state === 'active' && 'grant' in value && typeof value.grant === 'string' && value.grant.length > 0) return { state: 'active', grant: value.grant };
          }
        } catch { /* corrupt intent is not permission to restore */ }
        return { state: 'signed-out' };
      },
      async write(intent) {
        await fs.writeAsStringAsync(uri, JSON.stringify({ version: 1, ...intent }));
      },
    };
  } catch { return null; }
}
