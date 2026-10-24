type ScriptUrlPolicy = { createScriptURL: (value: string) => unknown };
type TrustedTypesHost = { trustedTypes?: { createPolicy: (name: string, rules: { createScriptURL: (value: string) => string }) => ScriptUrlPolicy } };

let policy: ScriptUrlPolicy | undefined;

/** The only script this policy can approve is our own fixed worker. */
export function serviceWorkerUrl(host: TrustedTypesHost): string {
  if (!host.trustedTypes) return '/sw.js';
  policy ??= host.trustedTypes.createPolicy('dukaanos#service-worker', {
    createScriptURL(value) {
      if (value !== '/sw.js') throw new TypeError('Unexpected service worker URL');
      return value;
    },
  });
  // Older DOM type libraries accept string here; preserve the actual browser
  // TrustedScriptURL object rather than coercing it back to an untrusted string.
  return policy.createScriptURL('/sw.js') as string;
}
