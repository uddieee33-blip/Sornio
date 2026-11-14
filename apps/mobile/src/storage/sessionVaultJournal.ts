/** Non-secret restart intent for the demo session vault.
 *
 * Keychain deletion can reject after an earlier session was durably written. A
 * per-process memory fallback alone cannot protect the *next* process from that
 * stale native record. This tiny journal contains no credential, token or
 * business data: it only records whether automatic session restore is allowed.
 * A missing/corrupt journal fails closed. Operational outboxes never use it;
 * they require the native encrypted store and still throw on any failure.
 */
export type VaultIntent = 'active' | 'signed-out';
export type VaultJournal = {
  read: () => Promise<VaultIntent | null>;
  write: (intent: VaultIntent) => Promise<void>;
};
export function defaultVaultJournal(): VaultJournal | null {
  try {
    // Legacy API is synchronous-to-use and supported by the installed Expo 58
    // runtime. The marker is intentionally outside SecureStore so a Keychain
    // delete denial cannot also erase the sign-out intent.
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
          if (typeof value === 'object' && value !== null && 'version' in value && value.version === 1 && 'state' in value && (value.state === 'active' || value.state === 'signed-out')) return value.state;
        } catch { /* corrupt intent is not permission to restore */ }
        return 'signed-out';
      },
      async write(intent) {
        await fs.writeAsStringAsync(uri, JSON.stringify({ version: 1, state: intent }));
      },
    };
  } catch { return null; }
}
