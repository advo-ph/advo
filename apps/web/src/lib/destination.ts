/**
 * Post-login role redirect destination.
 * explicitRedirect (e.g. from ?redirectTo=) wins when truthy;
 * otherwise admin → /admin, everyone else → /hub.
 */
export function destinationFor(
  role: string | undefined,
  explicitRedirect?: string | null,
): string {
  if (explicitRedirect) return explicitRedirect;
  return role === "admin" ? "/admin" : "/hub";
}
