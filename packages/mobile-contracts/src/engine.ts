import { CompanionError } from './errors';
import type { CompanionSession } from './session';
import type { CompanionSnapshot } from './snapshot';
import {
  decideSnapshotApply,
  freshnessFor,
  initialSyncStatus,
  type SyncEnvelope,
  type SyncStatus,
} from './sync';

export type EngineState = {
  session: CompanionSession | null;
  snapshot: CompanionSnapshot | null;
  sync: SyncStatus;
  envelope: SyncEnvelope | null;
};

export function emptyEngineState(mode: 'demo' | 'live' = 'demo'): EngineState {
  return { session: null, snapshot: null, sync: initialSyncStatus(mode), envelope: null };
}

function envelopeOf(snapshot: CompanionSnapshot, deviceId: string | null): SyncEnvelope {
  return {
    schemaVersion: snapshot.schemaVersion,
    businessId: snapshot.businessId,
    restoreGeneration: snapshot.restoreGeneration,
    cursor: snapshot.cursor,
    serverTimeIso: snapshot.producedAtIso,
    source: snapshot.source,
    deviceId,
    revoked: false,
  };
}

export class CompanionEngine {
  private state: EngineState;
  private inFlightGeneration = 0;
  constructor(initial: EngineState = emptyEngineState('demo')) {
    this.state = initial;
  }
  getState(): EngineState {
    return this.state;
  }
  signIn(session: CompanionSession, snapshot: CompanionSnapshot | null): EngineState {
    if (session.device.enrollmentStatus === 'revoked') {
      this.state = {
        session: null,
        snapshot: null,
        envelope: null,
        sync: {
          ...initialSyncStatus(session.mode),
          phase: 'revoked',
          freshnessLabel: 'Unavailable',
          message: 'This device can no longer read this business.',
        },
      };
      return this.state;
    }
    this.state = {
      session,
      snapshot,
      envelope: snapshot ? envelopeOf(snapshot, session.device.deviceId) : null,
      sync: {
        ...initialSyncStatus(session.mode),
        lastSuccessIso: snapshot?.producedAtIso ?? null,
        message: session.mode === 'demo' ? 'Demonstration figures. Not a live business record.' : initialSyncStatus('live').message,
      },
    };
    return this.state;
  }
  signOut(): EngineState {
    this.inFlightGeneration += 1;
    this.state = emptyEngineState(this.state.session?.mode === 'live' ? 'live' : 'demo');
    this.state.sync.message = 'Signed out. Local session keys were cleared.';
    return this.state;
  }
  beginRefresh(): { token: number; state: EngineState } {
    if (!this.state.session) throw new CompanionError('UNAUTHENTICATED', 'Sign in required.');
    const token = ++this.inFlightGeneration;
    this.state = {
      ...this.state,
      sync: {
        ...this.state.sync,
        phase: 'syncing',
        lastAttemptIso: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
        freshnessLabel: freshnessFor('syncing', this.state.session.mode),
        message: 'Refreshing a server-authorized copy.',
      },
    };
    return { token, state: this.state };
  }
  applySnapshot(token: number, snapshot: CompanionSnapshot): EngineState {
    if (token !== this.inFlightGeneration) {
      throw new CompanionError('STALE_SNAPSHOT', 'A newer refresh already completed.');
    }
    const session = this.state.session;
    if (!session) throw new CompanionError('UNAUTHENTICATED', 'Sign in required.');
    if (snapshot.businessId !== session.business.businessId) {
      throw new CompanionError('BUSINESS_MISMATCH', 'The snapshot belongs to a different business.');
    }
    if (snapshot.mode !== session.mode) {
      throw new CompanionError('DEMO_FORBIDDEN', 'Snapshot mode does not match the session.');
    }
    const incoming = envelopeOf(snapshot, session.device.deviceId);
    const decision = decideSnapshotApply(this.state.envelope, incoming);
    if (!decision.ok) throw decision.error;
    if (decision.kind === 'duplicate') {
      this.state = {
        ...this.state,
        sync: {
          ...this.state.sync,
          phase: 'synced',
          freshnessLabel: freshnessFor('synced', session.mode),
          message: session.mode === 'demo' ? 'Demonstration figures. Not a live business record.' : `Last synced ${snapshot.producedAtIso}.`,
        },
      };
      return this.state;
    }
    this.state = {
      session,
      snapshot,
      envelope: incoming,
      sync: {
        connectivity: 'online',
        phase: 'synced',
        schemaVersion: snapshot.schemaVersion,
        cursor: snapshot.cursor,
        restoreGeneration: snapshot.restoreGeneration,
        lastSuccessIso: snapshot.producedAtIso,
        lastAttemptIso: snapshot.producedAtIso,
        freshnessLabel: freshnessFor('synced', session.mode),
        message: session.mode === 'demo' ? 'Demonstration figures. Not a live business record.' : `Last synced ${snapshot.producedAtIso}.`,
      },
    };
    return this.state;
  }
  failRefresh(token: number, error: CompanionError): EngineState {
    if (token !== this.inFlightGeneration) return this.state;
    const mode = this.state.session?.mode ?? 'live';
    if (error.code === 'ACCESS_REVOKED') {
      this.state = {
        session: this.state.session,
        snapshot: null,
        envelope: null,
        sync: {
          ...this.state.sync,
          phase: 'revoked',
          freshnessLabel: 'Unavailable',
          message: error.message,
        },
      };
      return this.state;
    }
    if (error.code === 'REAUTH_REQUIRED' || error.code === 'UNAUTHENTICATED') {
      this.state = {
        ...this.state,
        sync: {
          ...this.state.sync,
          phase: 'reauth_required',
          freshnessLabel: 'Unavailable',
          message: error.message,
        },
      };
      return this.state;
    }
    const phase = this.state.snapshot ? 'interrupted' : 'never_synced';
    this.state = {
      ...this.state,
      sync: {
        ...this.state.sync,
        phase,
        freshnessLabel: freshnessFor(phase === 'interrupted' ? 'interrupted' : 'never_synced', mode),
        message: error.message,
      },
    };
    return this.state;
  }
  markOffline(): EngineState {
    const mode = this.state.session?.mode ?? 'demo';
    const phase = this.state.snapshot ? 'stale' : this.state.sync.phase;
    this.state = {
      ...this.state,
      sync: {
        ...this.state.sync,
        connectivity: 'offline',
        phase,
        freshnessLabel: freshnessFor(phase === 'stale' ? 'stale' : this.state.sync.phase, mode),
        message: this.state.snapshot
          ? `Offline. Last synced ${this.state.sync.lastSuccessIso ?? 'never'}. These figures may be out of date.`
          : 'Offline. No synchronized copy is available on this device.',
      },
    };
    return this.state;
  }
  markOnline(): EngineState {
    this.state = { ...this.state, sync: { ...this.state.sync, connectivity: 'online' } };
    return this.state;
  }
  switchBusiness(businessId: string): EngineState {
    if (!this.state.session) throw new CompanionError('UNAUTHENTICATED', 'Sign in required.');
    if (businessId !== this.state.session.business.businessId) {
      throw new CompanionError('BUSINESS_MISMATCH', 'This device is not granted for that business.');
    }
    return this.state;
  }
}
