'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { serviceWorkerUrl } from '@/lib/pwa/worker-url';

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};
type InstallState = {
  installed: boolean;
  canPrompt: boolean;
  busy: boolean;
  result: 'accepted' | 'dismissed' | 'unavailable' | null;
  install: () => Promise<void>;
};
const InstallContext = createContext<InstallState | null>(null);

/** Capture the browser event before the owner opens the installation screen. */
export function InstallProvider({ children }: { children: ReactNode }) {
  const deferred = useRef<InstallEvent | null>(null);
  const pending = useRef(false);
  const [installed, setInstalled] = useState(false);
  const [canPrompt, setCanPrompt] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<InstallState['result']>(null);

  useEffect(() => {
    const display = window.matchMedia('(display-mode: standalone)');
    const updateDisplay = () => setInstalled(display.matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    const ready = (event: Event) => {
      event.preventDefault();
      deferred.current = event as InstallEvent;
      setCanPrompt(true);
      setResult(null);
    };
    const completed = () => {
      deferred.current = null;
      setCanPrompt(false);
      setInstalled(true);
    };
    updateDisplay();
    window.addEventListener('beforeinstallprompt', ready);
    window.addEventListener('appinstalled', completed);
    display.addEventListener('change', updateDisplay);
    // Only a generic offline page is cached. Account pages and API responses
    // must always go through the server's current identity/tenant checks.
    if ('serviceWorker' in navigator && window.isSecureContext) {
      try {
        void navigator.serviceWorker.register(serviceWorkerUrl(window as Parameters<typeof serviceWorkerUrl>[0]), { scope: '/', updateViaCache: 'none' }).catch(() => undefined);
      } catch {
        // Installation guidance remains usable when browser policy blocks SWs.
      }
    }
    return () => {
      window.removeEventListener('beforeinstallprompt', ready);
      window.removeEventListener('appinstalled', completed);
      display.removeEventListener('change', updateDisplay);
    };
  }, []);

  const install = async () => {
    if (pending.current) return;
    const event = deferred.current;
    if (!event) { setResult('unavailable'); return; }
    deferred.current = null;
    pending.current = true;
    setCanPrompt(false);
    setBusy(true);
    try {
      await event.prompt();
      setResult((await event.userChoice).outcome);
    } catch {
      setResult('unavailable');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };

  return <InstallContext.Provider value={{ installed, canPrompt, busy, result, install }}>{children}</InstallContext.Provider>;
}

export function useInstall() {
  const value = useContext(InstallContext);
  if (!value) throw new Error('useInstall requires InstallProvider');
  return value;
}
