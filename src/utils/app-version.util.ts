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
