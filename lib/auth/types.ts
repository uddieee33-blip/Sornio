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

/** The fixed codes `/auth` knows how to phrase. */
export type AuthFailureNotice = 'link' | 'local' | 'unavailable';
