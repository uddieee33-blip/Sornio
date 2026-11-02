import {
  SECURE_KEYS,
  sessionFromUnknown,
  wipeSecureSession,
  type CompanionSession,
  type SecureStorePort,
} from '@sornio/mobile-contracts';

export async function readPersistedSession(store: SecureStorePort): Promise<CompanionSession | null> {
  const raw = await store.get(SECURE_KEYS.session);
  if (!raw) return null;
  try {
    return sessionFromUnknown(JSON.parse(raw));
  } catch {
    await store.delete(SECURE_KEYS.session);
    return null;
  }
}

export async function persistSession(store: SecureStorePort, session: CompanionSession): Promise<void> {
  await store.set(SECURE_KEYS.session, JSON.stringify(session));
}

export async function wipePersistedSession(store: SecureStorePort): Promise<void> {
  await wipeSecureSession(store);
}
