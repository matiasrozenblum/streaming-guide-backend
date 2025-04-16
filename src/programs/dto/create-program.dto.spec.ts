import { validate } from 'class-validator';
import { CreateProgramDto } from './create-program.dto';

describe('CreateProgramDto', () => {
  it('should validate a correct DTO', async () => {
    const dto = new CreateProgramDto();
    dto.name = 'Programa de Prueba';
    dto.description = 'Una descripción';
    dto.start_time = '10:00';
    dto.end_time = '12:00';
    dto.youtube_url = 'https://youtube.com/test';

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should fail if name is missing', async () => {
    const dto = new CreateProgramDto();
    const errors = await validate(dto);
    const nameError = errors.find(e => e.property === 'name');
    expect(nameError).toBeDefined();
    expect(nameError!.constraints).toHaveProperty('isNotEmpty');
  });

  it('should allow description to be missing', async () => {
    const dto = new CreateProgramDto();
    dto.name = 'Test Program';
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should allow optional fields to be missing', async () => {
    const dto = new CreateProgramDto();
    dto.name = 'Test Program';
    dto.description = 'Test Description';
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should accept all optional fields', async () => {
    const dto = new CreateProgramDto();
    dto.name = 'Test Program';
    dto.description = 'Test Description';
    dto.start_time = '10:00';
    dto.end_time = '11:00';
    dto.youtube_url = 'https://youtube.com/test';
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should fail if optional fields are not strings', async () => {
    const dto = new CreateProgramDto();
    dto.name = 'Test Program';
    dto.description = 'Test Description';
    dto.start_time = 123 as any;
    dto.end_time = 456 as any;
    dto.youtube_url = 789 as any;
    const errors = await validate(dto);
    expect(errors.some(e => e.property === 'start_time')).toBe(true);
    expect(errors.some(e => e.property === 'end_time')).toBe(true);
    expect(errors.some(e => e.property === 'youtube_url')).toBe(true);
  });
});
