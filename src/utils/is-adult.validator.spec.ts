import {
  ageInYears,
  isAdultBirthDate,
  MINIMUM_AGE_YEARS,
} from './is-adult.validator';

/** A date-only string for `years` ago, offset by `days` (negative = earlier). */
function birthDateFor(years: number, days = 0): string {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - years);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

describe('ageInYears', () => {
  it('counts only completed years', () => {
    expect(ageInYears(birthDateFor(30))).toBe(30);
  });

  it('does not count a birthday that has not arrived yet', () => {
    // One day short of turning 18.
    expect(ageInYears(birthDateFor(18, 1))).toBe(17);
  });

  it('counts the birthday itself', () => {
    expect(ageInYears(birthDateFor(18))).toBe(18);
  });

  it('returns null for an unparseable value', () => {
    expect(ageInYears('no es una fecha')).toBeNull();
  });

  it('accepts a Date as well as a string', () => {
    const d = new Date();
    d.setUTCFullYear(d.getUTCFullYear() - 25);
    expect(ageInYears(d)).toBe(25);
  });
});

describe('isAdultBirthDate', () => {
  it('accepts someone over the minimum age', () => {
    expect(isAdultBirthDate(birthDateFor(40))).toBe(true);
  });

  it('accepts someone exactly at the minimum age', () => {
    expect(isAdultBirthDate(birthDateFor(MINIMUM_AGE_YEARS))).toBe(true);
  });

  it('rejects someone one day short of the minimum', () => {
    expect(isAdultBirthDate(birthDateFor(MINIMUM_AGE_YEARS, 1))).toBe(false);
  });

  it('rejects a child', () => {
    expect(isAdultBirthDate(birthDateFor(12))).toBe(false);
  });

  describe('garbage input', () => {
    it('rejects a date in the future', () => {
      expect(isAdultBirthDate(birthDateFor(-5))).toBe(false);
    });

    it('rejects an implausibly old date, which would skew the age brackets', () => {
      expect(isAdultBirthDate('1066-10-14')).toBe(false);
    });

    it('rejects a non-date string', () => {
      expect(isAdultBirthDate('ayer')).toBe(false);
    });

    it.each([null, undefined, 42, {}, []])('rejects %p', (value) => {
      expect(isAdultBirthDate(value)).toBe(false);
    });
  });
});
