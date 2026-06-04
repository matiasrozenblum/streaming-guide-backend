import { isAtLeastVersion } from './app-version.util';

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
