import { describeSync, type SyncStatus } from '@sornio/mobile-contracts';

export function syncHeadline(status: SyncStatus): string {
  return describeSync(status);
}

export function neverLive(status: SyncStatus): boolean {
  return status.freshnessLabel !== 'Synced' || status.connectivity !== 'online';
}
