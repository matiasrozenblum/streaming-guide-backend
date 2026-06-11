import { isAtLeastVersion, needsMidnightSplit } from './app-version.util';

describe('isAtLeastVersion', () => {
  describe('returns false for missing/invalid version', () => {
    it('returns false when appVersion is undefined', () => {
      expect(isAtLeastVersion(undefined, '1.0.9')).toBe(false);
    });

    it('returns false when appVersion is empty string', () => {
      expect(isAtLeastVersion('', '1.0.9')).toBe(false);
    });
  });

  describe('major version comparisons', () => {
    it('returns true when major is higher', () => {
      expect(isAtLeastVersion('2.0.0', '1.0.9')).toBe(true);
    });

    it('returns false when major is lower', () => {
      expect(isAtLeastVersion('0.9.9', '1.0.9')).toBe(false);
    });
  });

  describe('minor version comparisons', () => {
    it('returns true when minor is higher (same major)', () => {
      expect(isAtLeastVersion('1.1.0', '1.0.9')).toBe(true);
    });

    it('returns false when minor is lower (same major)', () => {
      expect(isAtLeastVersion('1.0.0', '1.0.9')).toBe(false);
    });
  });

  describe('patch version comparisons (same major.minor)', () => {
    it('returns true when patch is exactly at min (1.0.9)', () => {
      expect(isAtLeastVersion('1.0.9', '1.0.9')).toBe(true);
    });

    it('returns true when patch is above min (1.0.10)', () => {
      expect(isAtLeastVersion('1.0.10', '1.0.9')).toBe(true);
    });

    it('returns false when patch is below min (1.0.8)', () => {
      expect(isAtLeastVersion('1.0.8', '1.0.9')).toBe(false);
    });
  });
});

describe('needsMidnightSplit', () => {
  const FRONTEND = 'https://staging.laguiadelstreaming.com';

  beforeEach(() => {
    process.env.FRONTEND_URL = FRONTEND;
  });

  it('returns false (no split) when Origin matches the frontend URL', () => {
    expect(needsMidnightSplit(undefined, FRONTEND)).toBe(false);
  });

  it('returns false when Origin matches frontend URL with trailing slash', () => {
    expect(needsMidnightSplit(undefined, `${FRONTEND}/`)).toBe(false);
  });

  it('returns false when mobile sends version >= 1.0.9', () => {
    expect(needsMidnightSplit('1.0.9', undefined)).toBe(false);
    expect(needsMidnightSplit('1.1.0', undefined)).toBe(false);
    expect(needsMidnightSplit('2.0.0', undefined)).toBe(false);
  });

  it('returns true (split) when no header is present and Origin is absent', () => {
    expect(needsMidnightSplit(undefined, undefined)).toBe(true);
  });

  it('returns true when version is below 1.0.9 and Origin is absent', () => {
    expect(needsMidnightSplit('1.0.8', undefined)).toBe(true);
  });

  it('returns true when Origin does not match frontend URL', () => {
    expect(needsMidnightSplit(undefined, 'https://some-other-origin.com')).toBe(
      true,
    );
  });
});
