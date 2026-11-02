import { CompanionError } from './errors';
import type { AuthenticationPort, CachePort, RequestControls, SnapshotPort } from './adapters';
import type { CompanionSession } from './session';
import { sessionFromUnknown } from './session';
import type { CompanionSnapshot } from './snapshot';
import { parseCompanionSnapshot } from './validation';

export const PRODUCTION_SYNC_PATH = '/v1/mobile/snapshot';

export type ProductionConfig = {
  baseUrl: string;
  enabled: boolean;
};

function withTimeout(controls: RequestControls | undefined): AbortSignal {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), controls?.timeoutMs ?? 15000);
  const onAbort = () => controller.abort();
  controls?.signal?.addEventListener('abort', onAbort, { once: true });
  controller.signal.addEventListener(
    'abort',
    () => {
      clearTimeout(timeout);
      controls?.signal?.removeEventListener('abort', onAbort);
    },
    { once: true },
  );
  return controller.signal;
}

export class ProductionAuth implements AuthenticationPort {
  constructor(
    private readonly cache: CachePort,
    private readonly config: ProductionConfig,
  ) {}
  async current(): Promise<CompanionSession | null> {
    const session = await this.cache.readSession();
    if (session?.mode === 'demo') {
      throw new CompanionError('DEMO_FORBIDDEN', 'A production auth adapter cannot resume a demo session.');
    }
    return session;
  }
  async signInDemo(): Promise<CompanionSession> {
    throw new CompanionError('DEMO_FORBIDDEN', 'Production authentication cannot open a demo session.');
  }
  async signOut(): Promise<void> {
    await this.cache.clear();
  }
  async signInLive(): Promise<CompanionSession> {
    if (!this.config.enabled) {
      throw new CompanionError(
        'PRODUCTION_DISABLED',
        'Live mobile authentication is disabled until Hybrid Sync V1 is proven on the desktop outbox.',
      );
    }
    throw new CompanionError('PRODUCTION_DISABLED', 'Live mobile authentication is not wired in Phase 1.');
  }
}

export class ProductionSnapshotAdapter implements SnapshotPort {
  constructor(private readonly config: ProductionConfig) {}
  async load(session: CompanionSession, controls?: RequestControls): Promise<CompanionSnapshot> {
    if (session.mode === 'demo') {
      throw new CompanionError('DEMO_FORBIDDEN', 'The production adapter will not load demo data.');
    }
    if (!this.config.enabled) {
      throw new CompanionError(
        'PRODUCTION_DISABLED',
        'Live companion sync is disabled until authenticated read projections exist.',
      );
    }
    withTimeout(controls);
    throw new CompanionError('PRODUCTION_DISABLED', 'Live companion sync is not wired in Phase 1.');
  }
}

/** Runtime validation used once a live payload exists. Never called for demo. */
export function parseLiveSnapshot(payload: unknown, expectedBusinessId: string): CompanionSnapshot {
  const snapshot = parseCompanionSnapshot(payload);
  if (snapshot.mode !== 'live' || snapshot.source !== 'desktop-outbox') {
    throw new CompanionError('DEMO_FORBIDDEN', 'Live adapter rejected a non-live snapshot.');
  }
  if (snapshot.businessId !== expectedBusinessId) {
    throw new CompanionError('BUSINESS_MISMATCH', 'Snapshot business does not match the session.');
  }
  return snapshot;
}

export function parseLiveSession(payload: unknown): CompanionSession {
  const session = sessionFromUnknown(payload);
  if (session.mode !== 'live') {
    throw new CompanionError('DEMO_FORBIDDEN', 'Live adapter rejected a demo session.');
  }
  return session;
}
