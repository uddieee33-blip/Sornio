import type { CompanionError } from './errors';
import type { CompanionSession } from './session';
import type { CompanionSnapshot } from './snapshot';
import type { SyncStatus } from './sync';

export type RequestControls = {
  signal?: AbortSignal;
  timeoutMs?: number;
};

export type CompanionStore = {
  mode: 'demo' | 'live';
  session: CompanionSession | null;
  snapshot: CompanionSnapshot | null;
  sync: SyncStatus;
};

export interface AuthenticationPort {
  current(): Promise<CompanionSession | null>;
  signInDemo(): Promise<CompanionSession>;
  signOut(): Promise<void>;
  /** Production sign-in. Phase 1 must throw PRODUCTION_DISABLED. */
  signInLive(_credentials: { email: string; secret: string }): Promise<CompanionSession>;
}

export interface SnapshotPort {
  load(session: CompanionSession, controls?: RequestControls): Promise<CompanionSnapshot>;
}

export interface CachePort {
  readSession(): Promise<CompanionSession | null>;
  writeSession(session: CompanionSession): Promise<void>;
  clear(): Promise<void>;
}

export interface SecureStorePort {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export type DataAccessBundle = {
  auth: AuthenticationPort;
  snapshots: SnapshotPort;
  cache: CachePort;
};

export function assertAdapterIsolation(live: SnapshotPort, demo: SnapshotPort): void {
  if (live === demo) {
    throw new Error('Production and demo snapshot adapters must not be the same object.');
  }
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: CompanionError };
