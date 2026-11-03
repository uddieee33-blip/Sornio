import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Appearance, useColorScheme } from 'react-native';
import { dusk, dawn, type Appearance as BrandAppearance, type Palette } from '@sornio/mobile-design';

export type ThemePreference = 'system' | BrandAppearance;

type ThemeValue = {
  preference: ThemePreference;
  appearance: BrandAppearance;
  palette: Palette;
  reduceMotion: boolean;
  setPreference: (value: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [preference, setPreference] = useState<ThemePreference>('system');
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => undefined);
    return () => sub.remove();
  }, []);
  const appearance: BrandAppearance =
    preference === 'system' ? (system === 'dark' ? 'dusk' : 'dawn') : preference;
  const value = useMemo<ThemeValue>(
    () => ({
      preference,
      appearance,
      palette: appearance === 'dusk' ? dusk : dawn,
      reduceMotion,
      setPreference,
    }),
    [preference, appearance, reduceMotion],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('ThemeProvider is required.');
  return value;
}

export function systemColorScheme(): 'light' | 'dark' | null {
  return Appearance.getColorScheme();
}
