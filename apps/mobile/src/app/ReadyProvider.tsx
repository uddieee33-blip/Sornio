import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

/**
 * Reports whether the React tree is mounted, and which state it settled into.
 *
 * Why this exists: a native process staying alive proves nothing about the
 * JavaScript. In a Debug simulator build React Native skips bundling entirely
 * (`SKIP_BUNDLING=1`) and waits for Metro, so the process can run for minutes
 * behind a splash screen. XCUITest needs a condition that is true only when the
 * application is genuinely usable.
 *
 * `useEffect` runs after React commits the tree to the host view hierarchy, so
 * flipping the flag there means: components mounted, initial render done. The
 * first screen adds its own identifier on top, so a test can wait for "mounted
 * AND the expected start screen is on screen".
 */
export type AppPhase = 'boot' | 'ready' | 'signed-out' | 'error' | 'demo';

const ReadyContext = createContext<boolean>(false);
const PhaseContext = createContext<AppPhase>('boot');

export function ReadyProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    // Deliberately not a setTimeout: a timer would make the flag mean "500 ms
    // have passed", which is exactly the fixed delay we must not rely on.
    setReady(true);
  }, []);
  return <ReadyContext.Provider value={ready}>{children}</ReadyContext.Provider>;
}

export function useAppReady(): boolean {
  return useContext(ReadyContext);
}

export function useAppPhase(): AppPhase {
  return useContext(PhaseContext);
}

/**
 * Publishes the state the app settled into as an accessibility identifier, so a
 * failing UI test reports where it actually was instead of only where it was not.
 *
 * This is phase information only: no business data, no customer or session
 * detail. It made the difference between "screen.settings never appeared" and
 * "the demonstration session never opened because bootstrap failed".
 */
export function PhaseContextProvider({ phase, children }: { phase: AppPhase; children: ReactNode }) {
  return <PhaseContext.Provider value={phase}>{children}</PhaseContext.Provider>;
}
