/** Presentation policy only. Every API still enforces its own session, owner, role and CSRF checks. */
export type PublicWebMode='landing'|'full';
export const PUBLIC_WEB_MODE:PublicWebMode='landing';
