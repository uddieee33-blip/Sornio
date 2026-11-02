import { requirePublisher } from './auth';
import { buildEnvelope } from './envelope';
import { ingestEnvelope } from './ingest';
import { CloudStore } from './store';
import {
  ReplicationError,
  type DigestFn,
  type IngestAck,
  type NativeOutboxRow,
  type Principal,
  type StreamName,
} from './types';

export type Transport = {
  send(envelope: unknown): Promise<IngestAck>;
};

export type FailureMode = 'none' | 'network' | 'conflict' | 'stale-generation';

export type SidecarAck = {
  restoreGeneration: string;
  lastSequence: Record<StreamName, number>;
};

export function emptyAck(generation: string): SidecarAck {
  return {
    restoreGeneration: generation,
    lastSequence: { billing: 0, customer: 0, retail: 0, inventory: 0 },
  };
}

export class InMemoryTransport implements Transport {
  failure: FailureMode = 'none';
  sent = 0;
  constructor(
    private readonly store: CloudStore,
    private readonly principal: Principal,
    private readonly digest: DigestFn,
    private readonly nowMs: () => number,
  ) {}

  async send(envelope: unknown): Promise<IngestAck> {
    this.sent += 1;
    if (this.failure === 'network') throw new ReplicationError('UNAUTHENTICATED', 'Network unavailable.');
    if (this.failure === 'stale-generation') {
      throw new ReplicationError('STALE_GENERATION', 'Restore generation does not match the enrolled publisher.');
    }
    return ingestEnvelope(this.store, this.principal, envelope, this.digest, this.nowMs());
  }
}

export class DesktopPublisher {
  readonly pending: NativeOutboxRow[] = [];
  ack: SidecarAck;
  writerLocked = false;
  flushesWhileLocked = 0;

  constructor(
    private readonly principal: Principal,
    private readonly digest: DigestFn,
    private readonly transport: Transport,
    generation: string,
  ) {
    this.ack = emptyAck(generation);
  }

  /** Called inside the local commit after outbox rows are durable. Never talks to the network. */
  noteCommit(row: NativeOutboxRow): void {
    this.pending.push({ ...row, payload: structuredClone(row.payload) });
  }

  unpublished(stream: StreamName): NativeOutboxRow[] {
    const after = this.ack.lastSequence[stream];
    return this.pending.filter((row) => row.stream === stream && row.sequence > after);
  }

  onRestore(generation: string): void {
    if (generation !== this.ack.restoreGeneration) {
      this.ack = emptyAck(generation);
    }
  }

  async flush(nowMs: number): Promise<IngestAck[]> {
    requirePublisher(this.principal, nowMs);
    if (this.principal.restoreGeneration !== this.ack.restoreGeneration) {
      this.ack = emptyAck(this.principal.restoreGeneration);
    }
    if (this.writerLocked) this.flushesWhileLocked += 1;
    const publishOrder: StreamName[] = ['inventory', 'customer', 'billing', 'retail'];
    const batch = publishOrder.flatMap((stream) => this.unpublished(stream)).sort((a, b) => {
      if (a.stream === b.stream) return a.sequence - b.sequence;
      return publishOrder.indexOf(a.stream) - publishOrder.indexOf(b.stream);
    });
    // Copy unpublished rows, then drop the writer lock before any network call.
    this.writerLocked = false;
    const acks: IngestAck[] = [];
    for (const row of batch) {
      const envelope = buildEnvelope(this.principal, row, this.digest);
      const ack = await this.transport.send(envelope);
      this.ack.lastSequence[row.stream] = row.sequence;
      this.pending.splice(
        this.pending.findIndex((item) => item.stream === row.stream && item.sequence === row.sequence),
        1,
      );
      acks.push(ack);
    }
    return acks;
  }
}

export function checkoutProceedsIfCloudDown(flushError: unknown): boolean {
  return flushError instanceof ReplicationError;
}
