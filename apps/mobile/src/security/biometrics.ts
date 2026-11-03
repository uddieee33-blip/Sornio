/**
 * Unlocks the companion session only. Never used as gym-member attendance.
 */
export type BiometricUnlock = {
  available: boolean;
  enrolled: boolean;
  label: string;
};

export async function readBiometricUnlock(): Promise<BiometricUnlock> {
  try {
    const LocalAuthentication = require('expo-local-authentication') as {
      hasHardwareAsync: () => Promise<boolean>;
      isEnrolledAsync: () => Promise<boolean>;
      supportedAuthenticationTypesAsync: () => Promise<number[]>;
    };
    const available = await LocalAuthentication.hasHardwareAsync();
    const enrolled = available ? await LocalAuthentication.isEnrolledAsync() : false;
    return {
      available,
      enrolled,
      label: 'Device unlock for the Sornio session. Not gym attendance.',
    };
  } catch {
    return { available: false, enrolled: false, label: 'Biometric unlock is unavailable in this build.' };
  }
}

export async function promptSessionUnlock(): Promise<boolean> {
  try {
    const LocalAuthentication = require('expo-local-authentication') as {
      authenticateAsync: (options: { promptMessage: string; disableDeviceFallback: boolean }) => Promise<{ success: boolean }>;
    };
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock Sornio',
      disableDeviceFallback: false,
    });
    return result.success === true;
  } catch {
    return false;
  }
}
