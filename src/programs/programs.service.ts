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

  findAll(): Promise<Program[]> {
    return this.programsRepository.find({
      relations: ['channel'],
    });
  }

  async findOne(id: string): Promise<Program> {
    const program = await this.programsRepository.findOne({ 
      where: { id: Number(id) },
      relations: ['channel']
    } as FindOneOptions);
    
    if (!program) {
      throw new NotFoundException(`Program with ID ${id} not found`);
    }
    return program;
  }

  create(createProgramDto: CreateProgramDto): Promise<Program> {
    const program = this.programsRepository.create(createProgramDto);
    return this.programsRepository.save(program);
  }

  update(id: number, updateProgramDto: UpdateProgramDto): Promise<Program> {
    return this.findOne(id.toString()).then(program => {
      Object.assign(program, updateProgramDto);
      return this.programsRepository.save(program);
    });
  }

  remove(id: string): Promise<void> {
    return this.programsRepository.delete(id).then(() => {});
  }
}