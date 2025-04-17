import { validate } from 'class-validator';
import { CreateChannelDto } from './create-channel.dto';

describe('CreateChannelDto', () => {
  it('should validate a correct DTO', async () => {
    const dto = new CreateChannelDto();
    dto.name = 'Canal de Prueba';
    dto.description = 'Una descripción opcional';
    dto.logo_url = 'https://logo.com/logo.png';
    dto.streaming_url = 'https://youtube.com/live';

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should fail if name is missing', async () => {
    const dto = new CreateChannelDto();
    const errors = await validate(dto);
    const nameError = errors.find(e => e.property === 'name');
    expect(nameError).toBeDefined();
    expect(nameError!.constraints).toHaveProperty('isNotEmpty');
  });

  it('should fail if streaming_url is missing', async () => {
    const dto = new CreateChannelDto();
    dto.name = 'Test Channel';
    dto.logo_url = 'https://example.com/logo.png';
    // streaming_url is not set at all

    const errors = await validate(dto);
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('streaming_url');
    expect(errors[0].constraints).toHaveProperty('isNotEmpty');
  });

  it('should fail if streaming_url is empty', async () => {
    const dto = new CreateChannelDto();
    dto.name = 'Test Channel';
    dto.logo_url = 'https://example.com/logo.png';
    dto.streaming_url = '';

    const errors = await validate(dto);
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('streaming_url');
    expect(errors[0].constraints).toHaveProperty('isNotEmpty');
  });

  it('should allow description and logo_url to be optional', async () => {
    const dto = new CreateChannelDto();
    dto.name = 'Test Channel';
    dto.streaming_url = 'https://example.com/stream';
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should validate with all fields', async () => {
    const dto = new CreateChannelDto();
    dto.name = 'Test Channel';
    dto.streaming_url = 'https://example.com/stream';
    dto.description = 'Test Description';
    dto.logo_url = 'https://example.com/logo.png';
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});
