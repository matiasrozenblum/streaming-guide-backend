import { validate } from 'class-validator';
import { CreateScheduleDto } from './create-schedule.dto';

describe('CreateScheduleDto', () => {
  it('debería ser válido con todos los campos requeridos', async () => {
    const dto = new CreateScheduleDto();
    dto.programId = '1';
    dto.channelId = '1';
    dto.dayOfWeek = 'monday';
    dto.startTime = '10:00';
    dto.endTime = '12:00';

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('debería fallar si falta algún campo', async () => {
    const dto = new CreateScheduleDto();
    dto.programId = '1';
    dto.channelId = '';
    dto.dayOfWeek = 'monday';
    // Falta startTime y endTime

    const errors = await validate(dto);
    const fieldsWithError = errors.map(e => e.property);

    expect(fieldsWithError).toContain('channelId');
    expect(fieldsWithError).toContain('startTime');
    expect(fieldsWithError).toContain('endTime');
  });

  it('debería fallar si algún campo es null', async () => {
    const dto = new CreateScheduleDto();
    dto.programId = null as any;
    dto.channelId = null as any;
    dto.dayOfWeek = null as any;
    dto.startTime = null as any;
    dto.endTime = null as any;

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});
