import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOneOptions, Repository } from 'typeorm';
import { Program } from './programs.entity';
import { CreateProgramDto } from './dto/create-program.dto';

@Injectable()
export class ProgramsService {
  constructor(
    @InjectRepository(Program)
    private programsRepository: Repository<Program>,
  ) {}

  findAll(): Promise<Program[]> {
    return this.programsRepository.find({
      relations: ['channel'], // 👈 esto incluye la relación con el canal
    });
  }

  async findOne(id: string): Promise<Program> {
      const channel = await this.programsRepository.findOne({ where: { id: Number(id) } } as FindOneOptions );
          if (!channel) {
            throw new NotFoundException(`Channel with ID ${id} not found`);
          }
          return channel;
  }

  create(createProgramDto: CreateProgramDto): Promise<Program> {
      const channel = this.programsRepository.create(createProgramDto);
      return this.programsRepository.save(channel);
  }

  remove(id: string): Promise<void> {
    return this.programsRepository.delete(id).then(() => {});
  }
}