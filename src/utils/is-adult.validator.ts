import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';

/** The product is for adults; the signup forms enforce the same floor. */
export const MINIMUM_AGE_YEARS = 18;

/**
 * Nobody alive is older than this. Guards the age-group reports against a
 * mistyped year (1066, 19XX typos) landing in the oldest bucket.
 */
const MAXIMUM_AGE_YEARS = 120;

/**
 * Completed years between `birthDate` and today, in UTC.
 *
 * birthDate is a date-only value, so UTC arithmetic keeps the result stable
 * regardless of where the server runs. Returns null when the input is not a
 * usable date.
 */
export function ageInYears(birthDate: string | Date): number | null {
  const birth =
    birthDate instanceof Date ? birthDate : new Date(`${birthDate}T00:00:00Z`);
  if (Number.isNaN(birth.getTime())) return null;

  const now = new Date();
  let age = now.getUTCFullYear() - birth.getUTCFullYear();

  // Subtract a year when the birthday has not come round yet this year.
  const monthDiff = now.getUTCMonth() - birth.getUTCMonth();
  if (
    monthDiff < 0 ||
    (monthDiff === 0 && now.getUTCDate() < birth.getUTCDate())
  ) {
    age--;
  }

  return age;
}

export function isAdultBirthDate(value: unknown): boolean {
  if (typeof value !== 'string' && !(value instanceof Date)) return false;

  const age = ageInYears(value);
  if (age === null) return false;

  // A negative age means a date in the future.
  return age >= MINIMUM_AGE_YEARS && age <= MAXIMUM_AGE_YEARS;
}

/**
 * Rejects a birth date belonging to someone under MINIMUM_AGE_YEARS.
 *
 * The web and mobile signup forms already check this, but they are the only
 * gate: without a server-side rule, anyone posting straight to the API can
 * register under age, and can land in an age bracket that skews the audience
 * reports the analytics pipeline produces.
 */
export function IsAdult(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isAdult',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          return isAdultBirthDate(value);
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be a valid date for someone at least ${MINIMUM_AGE_YEARS} years old`;
        },
      },
    });
  };
}
