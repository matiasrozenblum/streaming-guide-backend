/**
 * Parse a semver-style version string into [major, minor, patch].
 * Non-numeric parts default to 0.
 */
function parseVersion(version: string): [number, number, number] {
  const [major = 0, minor = 0, patch = 0] = version
    .split('.')
    .map((p) => parseInt(p, 10) || 0);
  return [major, minor, patch];
}

/**
 * Returns true when appVersion is at least minVersion (semver comparison).
 * Returns false if appVersion is absent or malformed.
 */
export function isAtLeastVersion(
  appVersion: string | undefined,
  minVersion: string,
): boolean {
  if (!appVersion) return false;
  const [maj, min, pat] = parseVersion(appVersion);
  const [majMin, minMin, patMin] = parseVersion(minVersion);

  if (maj !== majMin) return maj > majMin;
  if (min !== minMin) return min > minMin;
  return pat >= patMin;
}

/**
 * Returns true when the response should split cross-midnight schedules into two blocks.
 *
 * Unified format is returned when:
 *  - The request Origin matches the web frontend (identified via FRONTEND_URL env var), OR
 *  - The mobile client sends X-App-Version >= 1.0.9.
 *
 * Everything else (old mobile, no header) receives the split format for backward compat.
 */
export function needsMidnightSplit(
  appVersion: string | undefined,
  origin: string | undefined,
): boolean {
  const frontendUrl = (
    process.env.FRONTEND_URL || 'https://staging.laguiadelstreaming.com'
  ).replace(/\/$/, '');

  if (origin && origin.replace(/\/$/, '') === frontendUrl) return false;
  if (isAtLeastVersion(appVersion, '1.0.9')) return false;
  return true;
}
