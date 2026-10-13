/**
 * Sent on sign-out: the browser drops its HTTP cache for this site, so the next person on a
 * shared lab PC cannot dig the previous user's API responses out of it.
 * Local form drafts (localStorage) are kept so unsaved work survives a sign-out.
 */
export const SIGN_OUT_RESPONSE_HEADERS = Object.freeze({
  "Clear-Site-Data": '"cache"',
  "Cache-Control": "no-store",
});
