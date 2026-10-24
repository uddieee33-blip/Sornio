'use client';

/**
 * Live security posture — the console auditing itself.
 *
 * A Trust Centre that lists the controls we *intended* to ship is marketing.
 * This module asks the running browser what is actually true right now: is the
 * page on HTTPS, is it isolated from other origins, did the counter lock get a
 * PIN, is the audit chain intact, is the vault encrypted, is the privacy screen
 * on, is Everything On widening the console.
 *
 * Three rules keep it honest:
 *
 *   1. **Every check reads the real thing.** `document.cookie` for the httpOnly
 *      claim, `crossOriginIsolated` for the isolation claim, `isSecureContext`
 *      for the transport claim. Nothing is inferred from a config file, because
 *      a config file is what we *meant*, not what shipped.
 *   2. **Weight reflects consequence, not effort.** Losing the audit chain is
 *      worth more than losing a blurred figure, so the score says so. A score
 *      where every item is worth ten points is a progress bar, not an audit.
 *   3. **An honest zero.** A check that cannot run in this browser returns
 *      `unknown` and is excluded from the denominator rather than counted as a
 *      pass. Scoring an unanswerable question as green is how a dashboard ends
 *      up at 100% on a broken deployment.
 */

export type CheckState = 'pass' | 'warn' | 'fail' | 'unknown';

export type PostureCheck = {
  id: string;
  /** Owner-facing, in the words they would use. */
  title: string;
  /** What the check actually looked at, so the claim can be verified. */
  evidence: string;
  state: CheckState;
  /** What to do about it, when there is something to do. */
  action?: string;
  /** Consequence if this is wrong, 1–5. Drives the score. */
  weight: 1 | 2 | 3 | 4 | 5;
  group: 'transport' | 'device' | 'records' | 'console';
};

export type PostureReport = {
  checks: PostureCheck[];
  /** 0–100, weighted, with unknowns excluded from the denominator. */
  score: number;
  /** How many checks could not be answered in this browser. */
  unknowns: number;
  grade: 'excellent' | 'good' | 'fair' | 'poor';
  at: number;
};

export type PostureInput = {
  /** The vault reports itself encrypted. */
  vaultEncrypted: boolean | null;
  /** The counter lock has a PIN set. */
  lockEnabled: boolean;
  /** Minutes of idleness before the console locks itself. 0 = never. */
  autoLockMinutes: number;
  /** The hash chain verified end to end. */
  chainIntact: boolean | null;
  /** Entries written before the chain shipped, which cannot be verified. */
  unchainedEntries: number;
  /** Records sync to a real backend rather than living only on this device. */
  syncConfigured: boolean;
  /** Only a completed sync verifies an off-device copy. */
  syncVerified?: boolean;
  /** Figures are blurred until hovered. */
  privacyScreen: boolean;
  /** Everything On is revealing modules this trade's portal hid. */
  revealAll: boolean;
  /** A passkey can unlock this console. */
  passkeyEnrolled: boolean;
};

/**
 * The four facts only a browser can supply.
 *
 * None of them exists on a server: there is no `isSecureContext`, no
 * `crossOriginIsolated`, no `PublicKeyCredential` and no cookie jar during a
 * server render. They are collected by `readBrowserFacts` and *handed to*
 * `buildPostureReport` instead of being read inside it, which is the whole
 * point — the first client render can be given `null` (exactly the state the
 * server rendered) and the real answers can arrive one effect later.
 *
 * Reading `window` from inside the builder is what a hydration mismatch is
 * made of. The server scored four "unknown" checks that the client scored as
 * answers on its very first frame, so the same page was 37 in the HTML and 58
 * on screen, the ring flipped red to amber under React's error, and the tree
 * was thrown away and rebuilt on the client.
 */
export type BrowserFacts = {
  /** `window.isSecureContext` — HTTPS, or a hostname browsers treat as secure. */
  secure: boolean;
  /** `window.crossOriginIsolated`, or `undefined` where a browser omits it. */
  isolated: boolean | undefined;
  /** `'PublicKeyCredential' in window` — this browser can do WebAuthn at all. */
  webauthn: boolean;
  /** The page is on localhost, which browsers already treat as a secure context. */
  localhost: boolean;
  /**
   * `document.cookie` exposes none of the cookies that carry authority. These
   * three decide what a console may show and what a business has paid for: if
   * any of them is readable from script, an XSS is an entitlement escalation
   * rather than a nuisance.
   */
  authorityCookiesHidden: boolean;
};

const AUTHORITY_COOKIES = ['dukaan.plan', 'dukaan.portal', 'dukaan.everything'];

/** Read the browser facts. `null` on the server, where there are none to read. */
export function readBrowserFacts(): BrowserFacts | null {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;
  const cookie = document.cookie;
  return {
    secure: window.isSecureContext,
    isolated:
      'crossOriginIsolated' in window
        ? (window as unknown as { crossOriginIsolated: boolean }).crossOriginIsolated
        : undefined,
    webauthn: 'PublicKeyCredential' in window,
    localhost: /^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname),
    authorityCookiesHidden: AUTHORITY_COOKIES.every((name) => !cookie.includes(`${name}=`)),
  };
}

export function buildPostureReport(input: PostureInput, facts: BrowserFacts | null = null): PostureReport {
  const secure = facts ? facts.secure : undefined;
  const isolated = facts ? facts.isolated : undefined;
  const webauthn = facts ? facts.webauthn : false;
  const localhost = facts ? facts.localhost : false;

  const checks: PostureCheck[] = [
    /* ---------------------------------------------------------- transport */
    {
      id: 'secure-context',
      title: 'Encrypted connection',
      evidence:
        facts === null
          ? 'Read from this browser once the page has settled: whether a connection is encrypted is a property of this browser’s connection, not of the HTML a server sent.'
          : secure
            ? `window.isSecureContext is true — the page is on HTTPS${localhost ? ' (or localhost, which the browser treats as secure)' : ''}.`
            : 'This page is being served over plain HTTP. Anything typed here can be read in transit.',
      state: secure === undefined ? 'unknown' : secure ? 'pass' : 'fail',
      action: secure === false ? 'Serve the console over HTTPS before recording real money.' : undefined,
      weight: 5,
      group: 'transport',
    },
    {
      id: 'httponly',
      title: 'Authority cookies are out of reach of scripts',
      evidence:
        facts === null
          ? 'Read from this browser once the page has settled: a server render has no cookie jar, so nothing is claimed about it yet.'
          : facts.authorityCookiesHidden
            ? 'Read straight from document.cookie: the plan, portal and Everything On cookies are not in it, so no script on this page — ours or an injected one — can rewrite what this console is entitled to.'
            : 'One of the authority cookies — the plan, the portal or Everything On — is readable from script. On this page an XSS is an entitlement escalation, not a nuisance.',
      state: facts === null ? 'unknown' : facts.authorityCookiesHidden ? 'pass' : 'fail',
      action: facts !== null && !facts.authorityCookiesHidden ? 'Treat any third-party script on this origin as a way into the plan.' : undefined,
      weight: 5,
      group: 'transport',
    },
    {
      id: 'isolation',
      title: 'Isolated from other origins',
      evidence:
        facts === null
          ? 'Read from this browser once the page has settled; whether this page shares a process with another site is not something a server can see.'
          : isolated === undefined
            ? 'This browser does not report cross-origin isolation.'
            : isolated
              ? 'crossOriginIsolated is true — no other site shares this page’s process.'
              : 'Cross-origin isolation is off. In a preview or on localhost this is expected; in production the COOP/COEP headers switch it on.',
      // Not a failure outside production: the preview host is framed on
      // purpose, and saying "fail" for a deliberate configuration would train
      // an owner to ignore red.
      state: isolated === undefined ? 'unknown' : isolated ? 'pass' : 'warn',
      weight: 2,
      group: 'transport',
    },

    /* ------------------------------------------------------------- device */
    {
      id: 'vault',
      title: 'Records encrypted on this device',
      evidence: input.vaultEncrypted === null
        ? 'Checking this device…'
        : input.vaultEncrypted
        ? 'The local vault reports AES-GCM-256 at rest, with the key derived by PBKDF2.'
        : 'Records are being held in plain browser storage on this device.',
      state: input.vaultEncrypted === null ? 'unknown' : input.vaultEncrypted ? 'pass' : 'warn',
      action: input.vaultEncrypted !== false ? undefined : 'Turn on device encryption in the Trust Centre.',
      weight: 4,
      group: 'device',
    },
    {
      id: 'lock',
      title: 'Counter lock',
      evidence: input.lockEnabled
        ? `A PIN is set${input.autoLockMinutes > 0 ? `, and the console locks itself after ${input.autoLockMinutes} minute${input.autoLockMinutes === 1 ? '' : 's'} of inactivity.` : ', but it never locks itself — it only locks when you tap Lock.'}`
        : 'No PIN. Anyone who picks this device up can read the day’s takings and the khata.',
      state: input.lockEnabled ? (input.autoLockMinutes > 0 ? 'pass' : 'warn') : 'fail',
      action: input.lockEnabled
        ? input.autoLockMinutes > 0
          ? undefined
          : 'Set an auto-lock time so the counter locks itself when you walk away.'
        : 'Set a 6-digit counter PIN — it is the single biggest gap on a shop device.',
      weight: 5,
      group: 'device',
    },
    {
      id: 'passkey',
      title: 'Passkey unlock',
      evidence:
        facts === null
          ? 'Read from this browser once the page has settled: a server cannot ask whether this device has a sensor to enrol.'
          : !webauthn
            ? 'This browser has no WebAuthn support, so a passkey cannot be enrolled here.'
            : input.passkeyEnrolled
              ? 'A passkey on this device can unlock the console — the sensor matches in hardware and Sornio only ever stores the credential id.'
              : 'No passkey enrolled. The PIN still works; a passkey is faster and cannot be watched over your shoulder.',
      state: !webauthn ? 'unknown' : input.passkeyEnrolled ? 'pass' : 'warn',
      action: webauthn && !input.passkeyEnrolled ? 'Add a passkey from the Trust Centre.' : undefined,
      weight: 2,
      group: 'device',
    },
    {
      id: 'privacy-screen',
      title: 'Privacy screen',
      evidence: input.privacyScreen
        ? 'Figures are blurred until you hover them, and re-blur the moment this window loses focus.'
        : 'Figures are shown plainly. On a counter facing customers, that is a shoulder-surf away from the day’s takings.',
      state: input.privacyScreen ? 'pass' : 'warn',
      action: input.privacyScreen ? undefined : 'Turn on the privacy screen in Settings → Appearance.',
      weight: 1,
      group: 'device',
    },

    /* ------------------------------------------------------------ records */
    {
      id: 'audit-chain',
      title: 'Audit history is unbroken',
      evidence: input.chainIntact === null
        ? 'Checking…'
        : input.chainIntact
        ? `Every chained entry links to the hash of the one before it, and the whole chain re-verified${input.unchainedEntries > 0 ? ` — ${input.unchainedEntries} older entries predate the chain and are listed as unverifiable rather than assumed fine.` : '.'}`
        : 'The chain did not verify. An entry has been edited or removed in storage.',
      state: input.chainIntact === null ? 'unknown' : input.chainIntact ? 'pass' : 'fail',
      action: input.chainIntact !== false ? undefined : 'Re-verify from the audit screen and compare against your paper records.',
      weight: 5,
      group: 'records',
    },
    {
      id: 'backup',
      title: 'Records exist somewhere other than this device',
      evidence: input.syncConfigured
        ? input.syncVerified
          ? 'The last sync completed successfully.'
          : 'Cloud sync is configured. An off-device copy has not been verified.'
        : 'Local-first: everything lives in this browser. Nothing leaves the device — and nothing survives it being lost, either.',
      // Local-first is a legitimate choice, not a failure. It is a warning
      // because the *consequence* of a lost device is total, and an owner
      // should have decided that deliberately rather than by default.
      state: input.syncConfigured ? input.syncVerified ? 'pass' : 'unknown' : 'warn',
      action: input.syncConfigured ? undefined : 'Export regularly from Reports, or connect Supabase to sync.',
      weight: 3,
      group: 'records',
    },

    /* ------------------------------------------------------------ console */
    {
      id: 'reveal',
      title: 'Console shape',
      evidence: input.revealAll
        ? 'Everything On is live: all 27 modules are reachable. Your paid plan is unaffected — that is checked separately, after this, against its own signed cookie.'
        : 'The console carries exactly what this trade’s portal declares, enforced at the edge before a page renders.',
      state: input.revealAll ? 'warn' : 'pass',
      action: input.revealAll ? 'Switch it off in Settings when you no longer need the extra screens.' : undefined,
      // Low weight: this is informational. Everything On widens what is
      // *visible*; it grants nothing, which is why it is not worth more.
      weight: 1,
      group: 'console',
    },
  ];

  /* ---------------------------------------------------------------- score */

  const scored = checks.filter((check) => check.state !== 'unknown');
  const total = scored.reduce((sum, check) => sum + check.weight, 0);
  const earned = scored.reduce((sum, check) => {
    if (check.state === 'pass') return sum + check.weight;
    // A warning is a partial credit, not a pass: the control exists, the
    // posture is weaker than it could be.
    if (check.state === 'warn') return sum + check.weight * 0.5;
    return sum;
  }, 0);

  const score = total === 0 ? 0 : Math.round((earned / total) * 100);

  return {
    checks,
    score,
    unknowns: checks.length - scored.length,
    grade: score >= 90 ? 'excellent' : score >= 75 ? 'good' : score >= 55 ? 'fair' : 'poor',
    at: Date.now(),
  };
}

export const GROUP_LABELS: Record<PostureCheck['group'], string> = {
  transport: 'The connection',
  device: 'This device',
  records: 'Your records',
  console: 'This console',
};
