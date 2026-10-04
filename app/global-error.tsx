'use client';

/**
 * Last-resort boundary: the root layout itself failed.
 *
 * This is the only screen that renders without the app shell, so it carries
 * its own styles inline and cannot depend on Tailwind having loaded.
 */

import { useEffect } from 'react';
import { captureError } from '@/lib/security/monitor';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    captureError(error, 'global-error-boundary');
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0b0d12',
          color: '#e4e4e7',
          fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
          padding: '24px',
        }}
      >
        <div style={{ maxWidth: '30rem' }}>
          <p style={{ margin: 0, fontSize: '11px', letterSpacing: '0.2em', textTransform: 'uppercase', color: '#818cf8', fontWeight: 700 }}>
            DukaanOS
          </p>
          <h1 style={{ margin: '12px 0 0', fontSize: '24px', lineHeight: 1.25, fontWeight: 700 }}>
            The app could not start
          </h1>
          <p style={{ margin: '12px 0 0', fontSize: '14px', lineHeight: 1.6, color: '#a1a1aa' }}>
            Your saved records are still on this device and have not been modified. Reloading clears the problem in almost
            every case.
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: '20px',
              padding: '10px 18px',
              borderRadius: '12px',
              border: 'none',
              background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #d946ef 100%)',
              color: 'white',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Reload DukaanOS
          </button>
          <p style={{ margin: '16px 0 0', fontSize: '11px', color: '#52525b', fontFamily: 'ui-monospace, monospace' }}>
            Reference: {error.digest ?? 'local'}
          </p>
        </div>
      </body>
    </html>
  );
}
