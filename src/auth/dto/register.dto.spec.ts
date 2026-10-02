import { validate } from 'class-validator';
import { RegisterDto } from './register.dto';
import { MINIMUM_AGE_YEARS } from '../../utils/is-adult.validator';

function yearsAgo(years: number, days = 0): string {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - years);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function validDto(birthDate?: string): RegisterDto {
  const dto = new RegisterDto();
  dto.registration_token = 'token';
  dto.firstName = 'Ana';
  dto.lastName = 'Pérez';
  dto.password = 'secreto123';
  dto.gender = 'female';
  dto.birthDate = birthDate;
  return dto;
}

const birthDateErrors = async (dto: RegisterDto) =>
  (await validate(dto)).filter((e) => e.property === 'birthDate');

describe('RegisterDto birthDate', () => {
  it('accepts an adult', async () => {
    expect(await birthDateErrors(validDto(yearsAgo(30)))).toHaveLength(0);
  });

  it('accepts someone exactly at the minimum age', async () => {
    expect(
      await birthDateErrors(validDto(yearsAgo(MINIMUM_AGE_YEARS))),
    ).toHaveLength(0);
  });

  /**
   * The web and mobile forms already block this. The point of the rule is the
   * caller that skips the form and posts straight to the API.
   */
  it('rejects a minor', async () => {
    const errors = await birthDateErrors(validDto(yearsAgo(14)));
    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toHaveProperty('isAdult');
  });

  it('rejects someone one day short of the minimum age', async () => {
    expect(
      await birthDateErrors(validDto(yearsAgo(MINIMUM_AGE_YEARS, 1))),
    ).toHaveLength(1);
  });

  it('rejects a date in the future', async () => {
    expect(await birthDateErrors(validDto(yearsAgo(-1)))).toHaveLength(1);
  });

  it('stays optional when omitted', async () => {
    expect(await birthDateErrors(validDto(undefined))).toHaveLength(0);
  });
});
