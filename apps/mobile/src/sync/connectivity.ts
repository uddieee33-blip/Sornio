import type { Connectivity } from '@sornio/mobile-contracts';

export async function readConnectivity(): Promise<Connectivity> {
  try {
    const Network = require('expo-network') as {
      getNetworkStateAsync: () => Promise<{ isConnected?: boolean | null }>;
    };
    const state = await Network.getNetworkStateAsync();
    if (state.isConnected === true) return 'online';
    if (state.isConnected === false) return 'offline';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}
