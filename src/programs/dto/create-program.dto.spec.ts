import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateProgramDto } from './create-program.dto';

describe('CreateProgramDto', () => {
  it('debería validar con solo los campos obligatorios', async () => {
    const input = {
      name: 'Mi Programa',
      description: 'Descripción del programa',
    };

    const dto = plainToInstance(CreateProgramDto, input);
    const errors = await validate(dto);

    expect(errors.length).toBe(0);
  });

  it('debería fallar si falta name', async () => {
    const input = {
      description: 'Descripción sin nombre',
    };

    const dto = plainToInstance(CreateProgramDto, input);
    const errors = await validate(dto);

    expect(errors.some((e) => e.property === 'name')).toBe(true);
  });

  it('debería fallar si falta description', async () => {
    const input = {
      name: 'Programa sin descripción',
    };

    const dto = plainToInstance(CreateProgramDto, input);
    const errors = await validate(dto);

    expect(errors.some((e) => e.property === 'description')).toBe(true);
  });

  it('debería aceptar todos los campos opcionales', async () => {
    const input = {
      name: 'Programa completo',
      description: 'Con todos los campos',
      startTime: '10:00',
      endTime: '12:00',
      youtube_url: 'https://youtube.com/test',
    };

    const dto = plainToInstance(CreateProgramDto, input);
    const errors = await validate(dto);

    expect(errors.length).toBe(0);
  });

  it('debería fallar si los opcionales no son strings', async () => {
    const input = {
      name: 'Programa inválido',
      description: 'Campos opcionales mal tipados',
      startTime: 10,
      endTime: false,
      youtube_url: 123,
    };

    const dto = plainToInstance(CreateProgramDto, input);
    const errors = await validate(dto);

    expect(errors.some((e) => e.property === 'startTime')).toBe(true);
    expect(errors.some((e) => e.property === 'endTime')).toBe(true);
    expect(errors.some((e) => e.property === 'youtube_url')).toBe(true);
  });
});
