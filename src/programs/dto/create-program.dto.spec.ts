import { validate } from 'class-validator';
import { CreateProgramDto } from './create-program.dto';

describe('CreateProgramDto', () => {
  it('should validate a correct DTO', async () => {
    const dto = new CreateProgramDto();
    dto.name = 'Programa de Prueba';
    dto.description = 'Una descripción';
    dto.youtube_url = 'https://youtube.com/test';
    dto.channel_id = 1;

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
    dto.channel_id = 1;
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should allow optional fields to be missing', async () => {
    const dto = new CreateProgramDto();
    dto.name = 'Test Program';
    dto.description = 'Test Description';
    dto.channel_id = 1;
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should accept all optional fields', async () => {
    const dto = new CreateProgramDto();
    dto.name = 'Test Program';
    dto.description = 'Test Description';
    dto.youtube_url = 'https://youtube.com/test';
    dto.channel_id = 1;
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should fail if optional fields are not strings', async () => {
    const dto = new CreateProgramDto();
    dto.name = 'Test Program';
    dto.description = 'Test Description';
    dto.youtube_url = 789 as any;
    dto.channel_id = 1;
    const errors = await validate(dto);
    expect(errors.some(e => e.property === 'youtube_url')).toBe(true);
  });
});
