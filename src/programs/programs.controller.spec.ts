import { Test, TestingModule } from '@nestjs/testing';
import { ProgramsController } from './programs.controller';
import { ProgramsService } from './programs.service';
import { CreateProgramDto } from './dto/create-program.dto';
import { Program } from './programs.entity';

describe('ProgramsController', () => {
  let controller: ProgramsController;
  let service: ProgramsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProgramsController],
      providers: [
        {
          provide: ProgramsService,
          useValue: {
            findAll: jest.fn().mockResolvedValue([{ name: 'Programa 1', description: 'Descripción del programa' }]),
            findOne: jest.fn().mockResolvedValue({ name: 'Programa 1', description: 'Descripción del programa' }),
            create: jest.fn().mockResolvedValue({ name: 'Programa 1', description: 'Descripción del programa' }),
            remove: jest.fn().mockResolvedValue(null),
          },
        },
      ],
    }).compile();

    controller = module.get<ProgramsController>(ProgramsController);
    service = module.get<ProgramsService>(ProgramsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return an array of programs', async () => {
    const result = await controller.findAll();
    expect(result).toEqual([{ name: 'Programa 1', description: 'Descripción del programa' }]);
  });

  it('should return a single program', async () => {
    const result = await controller.findOne('1');
    expect(result).toEqual({ name: 'Programa 1', description: 'Descripción del programa' });
  });

  it('should create a new program', async () => {
    const createProgramDto: CreateProgramDto = { 
      name: 'Programa 1',
      description: 'Descripción del programa'
    };
    const result = await controller.create(createProgramDto);
    expect(result).toEqual({ name: 'Programa 1', description: 'Descripción del programa' });
  });

  it('should delete a program', async () => {
    const result = await controller.remove('1');
    expect(result).toBeNull();
  });
});