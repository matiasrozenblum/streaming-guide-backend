import { validate } from 'class-validator';
import { CreatePanelistDto } from './create-panelist.dto';

describe('CreatePanelistDto', () => {
  it('should validate a valid DTO', async () => {
    const dto = new CreatePanelistDto();
    dto.name = 'Panelista Test';
    dto.bio = 'Una biografía de ejemplo';

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should fail if name is missing', async () => {
    const dto = new CreatePanelistDto();
    dto.bio = 'Una biografía de ejemplo';

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('name');
  });

  it('should fail if name is empty string', async () => {
    const dto = new CreatePanelistDto();
    dto.name = '';
    dto.bio = 'Texto';

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('name');
  });

  it('should fail if name is not a string', async () => {
    const dto = new CreatePanelistDto();
    // @ts-expect-error
    dto.name = 123;
    dto.bio = 'Bio válida';

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('name');
  });

  it('should fail if bio is not a string', async () => {
    const dto = new CreatePanelistDto();
    dto.name = 'Nombre válido';
    // @ts-expect-error
    dto.bio = 123;

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('bio');
  });
});
