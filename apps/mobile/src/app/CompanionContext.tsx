import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
  /** True while the first session read is in flight. */
  booting: boolean;
  /** True when no session exists because the owner signed out or cleared the session. */
  signedOut: boolean;
  setScreen: (screen: ScreenId) => void;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
  wipe: () => Promise<void>;
  /** Opens the demonstration workspace after an explicit sign-out. */
  startDemo: () => Promise<void>;
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
  const [booting, setBooting] = useState(true);
  const [signedOut, setSignedOut] = useState(false);

  /* Boot and sign-out can overlap: the first render starts bootstrap, and the
     owner can press Sign out before it resolves. One shared guard keeps a
     second bootstrap from resurrecting a session that was just cleared. */
  const bootToken = useRef(0);

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

  /**
   * Restores the stored session, or opens a demonstration session when this
   * device has never been used. `allowDemo` is false after an explicit sign-out
   * so a deliberate exit is never silently replaced by a fresh demo identity.
   */
  const bootstrap = useCallback(
    async (allowDemo = true) => {
      const token = ++bootToken.current;
      setBooting(true);
      try {
        const stored = await readPersistedSession(secure);
        if (token !== bootToken.current) return;
        if (!stored && !allowDemo) {
          engine.signOut();
          setError(null);
          setSignedOut(true);
          publish();
          return;
        }
        const started = stored ?? (await auth.signInDemo());
        const copy = await snapshots.load(started);
        if (token !== bootToken.current) return;
        engine.signIn(started, copy);
        await persistSession(secure, started);
        setSignedOut(false);
        publish();
      } finally {
        if (token === bootToken.current) setBooting(false);
      }
    },
    [publish],
  );

  const signOut = useCallback(async () => {
    // Invalidate any in-flight bootstrap before the session keys are cleared.
    bootToken.current += 1;
    await auth.signOut();
    await wipePersistedSession(secure);
    engine.signOut();
    setScreen('home');
    setError(null);
    setSignedOut(true);
    setBooting(false);
    publish();
  }, [publish]);

  const wipe = useCallback(async () => {
    bootToken.current += 1;
    await wipePersistedSession(secure);
    engine.signOut();
    setError(null);
    setSignedOut(true);
    setBooting(false);
    publish();
  }, [publish]);

  /** Re-enters the demonstration workspace after the owner signed out. */
  const startDemo = useCallback(async () => {
    await bootstrap(true);
  }, [bootstrap]);

  useEffect(() => {
    bootstrap(true).catch((caught) => {
      setBooting(false);
      setError(diagnosticMessage(caught));
    });
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
    () => ({
      session,
      snapshot,
      sync,
      screen,
      screens,
      error,
      booting,
      signedOut,
      setScreen,
      refresh,
      signOut,
      wipe,
      startDemo,
    }),
    [session, snapshot, sync, screen, screens, error, booting, signedOut, refresh, signOut, wipe, startDemo],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useCompanion(): CompanionValue {
  const value = useContext(Context);
  if (!value) throw new Error('CompanionProvider is required.');
  return value;
}
