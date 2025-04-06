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
    dto.description = 'Una descripción';
    dto.logo_url = 'https://logo.com/logo.png';
    dto.streaming_url = 'https://youtube.com/live';

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('name');
  });

  it('should fail if streaming_url is missing', async () => {
    const dto = new CreateChannelDto();
    dto.name = 'Canal de Prueba';

    const errors = await validate(dto);
    const streamingUrlError = errors.find(e => e.property === 'streaming_url');
    expect(streamingUrlError).toBeDefined();
  });

  it('should allow description and logo_url to be optional', async () => {
    const dto = new CreateChannelDto();
    dto.name = 'Canal sin descripción ni logo';
    dto.streaming_url = 'https://youtube.com/live';

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });
});
