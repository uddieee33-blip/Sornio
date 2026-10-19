/**
 * Types shared by the auth flow.
 *
 * `AuthMode` is the answer to the question every screen in this flow has to ask:
 * is there a provider to talk to, or is this the device on its own? It is spelled
 * the same way in the API response, the store, and the badge on the Security page
 * so that "which mode am I in" cannot mean three different things depending on
 * where you asked.
 */

/** Where identity comes from on this deployment. */
export type AuthMode = 'supabase' | 'local';

/**
 * The fixed codes `/auth` knows how to phrase. `config` is the deployment's own
 * configuration gap — the session secret is missing or too short — phrased by
 * `sessionSecretConfigError()` so it matches every API door word for word.
 */
export type AuthFailureNotice = 'link' | 'local' | 'unavailable' | 'config';

/**
 * The fixed codes the "confirm it's you" step can fail with.
 *
 * Fixed, for the same reason the notices above are: the endpoint knows *what*
 * went wrong, the screen owns *how it is said*, and neither should be improvised
 * from provider text. `confirm-session-ended` is the one that changes the screen
 * rather than the message — the account session behind the app session is gone,
 * so there is nothing left to confirm against and the full sign-in form is the
 * only honest door.
 */
export type ConfirmFailureCode = 'confirm-failed' | 'confirm-session-ended' | 'confirm-unavailable' | 'unreachable';
