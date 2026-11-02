import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import {
  CompanionEngine,
  CompanionError,
  DemoAuth,
  DemoSnapshotAdapter,
  MemoryCache,
  diagnosticMessage,
  type CompanionSession,
  type CompanionSnapshot,
  type ScreenId,
  type SyncStatus,
  screensFor,
} from '@sornio/mobile-contracts';
import { createSecureStore } from '../storage/secureStore';
import { persistSession, readPersistedSession, wipePersistedSession } from '../storage/sessionStore';
import { readConnectivity } from '../sync/connectivity';

type CompanionValue = {
  session: CompanionSession | null;
  snapshot: CompanionSnapshot | null;
  sync: SyncStatus;
  screen: ScreenId;
  screens: ScreenId[];
  error: string | null;
  setScreen: (screen: ScreenId) => void;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
  wipe: () => Promise<void>;
};

const Context = createContext<CompanionValue | null>(null);
const engine = new CompanionEngine();
const cache = new MemoryCache();
const auth = new DemoAuth(cache);
const snapshots = new DemoSnapshotAdapter();
const secure = createSecureStore();

export function CompanionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<CompanionSession | null>(null);
  const [snapshot, setSnapshot] = useState<CompanionSnapshot | null>(null);
  const [sync, setSync] = useState(engine.getState().sync);
  const [screen, setScreen] = useState<ScreenId>('home');
  const [error, setError] = useState<string | null>(null);

  const publish = useCallback(() => {
    const state = engine.getState();
    setSession(state.session);
    setSnapshot(state.snapshot);
    setSync(state.sync);
  }, []);

  const refresh = useCallback(async () => {
    const current = engine.getState().session;
    if (!current) return;
    const connectivity = await readConnectivity();
    if (connectivity === 'offline') {
      engine.markOffline();
      publish();
      return;
    }
    engine.markOnline();
    const { token } = engine.beginRefresh();
    publish();
    try {
      const next = await snapshots.load(current);
      engine.applySnapshot(token, next);
      setError(null);
    } catch (caught) {
      const companion =
        caught instanceof CompanionError
          ? caught
          : new CompanionError('NETWORK', diagnosticMessage(caught), true);
      engine.failRefresh(token, companion);
      setError(companion.message);
    }
    publish();
  }, [publish]);

  const bootstrap = useCallback(async () => {
    const stored = await readPersistedSession(secure);
    const started = stored ?? (await auth.signInDemo());
    const copy = await snapshots.load(started);
    engine.signIn(started, copy);
    await persistSession(secure, started);
    publish();
  }, [publish]);

  const signOut = useCallback(async () => {
    await auth.signOut();
    await wipePersistedSession(secure);
    engine.signOut();
    setScreen('home');
    setError(null);
    publish();
    await bootstrap();
  }, [bootstrap, publish]);

  const wipe = useCallback(async () => {
    await wipePersistedSession(secure);
    engine.signOut();
    setError(null);
    publish();
    await bootstrap();
  }, [bootstrap, publish]);

  useEffect(() => {
    bootstrap().catch((caught) => setError(diagnosticMessage(caught)));
  }, [bootstrap]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh().catch(() => undefined);
    });
    return () => sub.remove();
  }, [refresh]);

  const screens = useMemo(
    () => (snapshot ? screensFor(snapshot.role, snapshot.portalId) : (['home', 'settings'] as ScreenId[])),
    [snapshot],
  );

  const value = useMemo<CompanionValue>(
    () => ({ session, snapshot, sync, screen, screens, error, setScreen, refresh, signOut, wipe }),
    [session, snapshot, sync, screen, screens, error, refresh, signOut, wipe],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useCompanion(): CompanionValue {
  const value = useContext(Context);
  if (!value) throw new Error('CompanionProvider is required.');
  return value;
}
