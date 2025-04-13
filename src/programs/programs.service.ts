import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOneOptions, Repository } from 'typeorm';
import { Program } from './programs.entity';
import { CreateProgramDto } from './dto/create-program.dto';
import { UpdateProgramDto } from './dto/update-program.dto';

@Injectable()
export class ProgramsService {
  constructor(
    @InjectRepository(Program)
    private programsRepository: Repository<Program>,
  ) {}

  async create(createProgramDto: CreateProgramDto): Promise<Program> {
    const program = this.programsRepository.create({
      ...createProgramDto,
      start_time: createProgramDto.start_time || null,
      end_time: createProgramDto.end_time || null,
    });
    return await this.programsRepository.save(program);
  }

  async findAll(): Promise<Program[]> {
    return await this.programsRepository.find();
  }

  async findOne(id: number): Promise<Program> {
    const program = await this.programsRepository.findOne({ where: { id } });
    if (!program) {
      throw new NotFoundException(`Program with ID ${id} not found`);
    }
    return program;
  }

  async update(id: number, updateProgramDto: UpdateProgramDto): Promise<Program> {
    const program = await this.findOne(id);
    const updatedProgram = this.programsRepository.merge(program, {
      ...updateProgramDto,
      start_time: updateProgramDto.start_time || null,
      end_time: updateProgramDto.end_time || null,
    });
    return await this.programsRepository.save(updatedProgram);
  }

  async remove(id: number): Promise<void> {
    const result = await this.programsRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Program with ID ${id} not found`);
    }
  }
}