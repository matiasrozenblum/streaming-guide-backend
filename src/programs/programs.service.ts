import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOneOptions, Repository } from 'typeorm';
import { Program } from './programs.entity';
import { CreateProgramDto } from './dto/create-program.dto';
import { UpdateProgramDto } from './dto/update-program.dto';
import { Panelist } from '../panelists/panelists.entity';
import { Channel } from '../channels/channels.entity';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class ProgramsService {
  constructor(
    @InjectRepository(Program)
    private programsRepository: Repository<Program>,
    @InjectRepository(Panelist)
    private panelistsRepository: Repository<Panelist>,
    @InjectRepository(Channel)
    private channelsRepository: Repository<Channel>,
    private redisService: RedisService,
  ) {}

  async create(createProgramDto: CreateProgramDto): Promise<any> {
    const channelId = createProgramDto.channel_id;

    const channel = await this.channelsRepository.findOne({ where: { id: channelId } });
    if (!channel) {
      throw new NotFoundException(`Channel with ID ${channelId} not found`);
    }

    const program = this.programsRepository.create(createProgramDto);
    program.channel = channel;
    const savedProgram = await this.programsRepository.save(program);
    await this.redisService.delByPattern('schedules:all:*');
    return {
      id: savedProgram.id,
      name: savedProgram.name,
      description: savedProgram.description,
      panelists: savedProgram.panelists,
      logo_url: savedProgram.logo_url,
      youtube_url: savedProgram.youtube_url,
      is_live: savedProgram.is_live,
      stream_url: savedProgram.stream_url,
      channel_id: savedProgram.channel?.id,
      channel_name: savedProgram.channel?.name || null,
    };
  }

  async findAll(): Promise<any[]> {
    const programs = await this.programsRepository
      .createQueryBuilder('program')
      .leftJoinAndSelect('program.channel', 'channel')
      .leftJoinAndSelect('program.panelists', 'panelists')
      .orderBy('panelists.id', 'ASC')
      .getMany();
    return programs.map(program => ({
      id: program.id,
      name: program.name,
      description: program.description,
      panelists: program.panelists,
      logo_url: program.logo_url,
      youtube_url: program.youtube_url,
      is_live: program.is_live,
      stream_url: program.stream_url,
      channel_id: program.channel?.id,
      channel_name: program.channel?.name || null,
    }));
  }

  async findOne(id: number): Promise<any> {
    const program = await this.programsRepository
      .createQueryBuilder('program')
      .leftJoinAndSelect('program.channel', 'channel')
      .leftJoinAndSelect('program.panelists', 'panelists')
      .where('program.id = :id', { id })
      .orderBy('panelists.id', 'ASC')
      .getOne();
    if (!program) {
      throw new NotFoundException(`Program with ID ${id} not found`);
    }
    return {
      id: program.id,
      name: program.name,
      description: program.description,
      panelists: program.panelists,
      logo_url: program.logo_url,
      youtube_url: program.youtube_url,
      is_live: program.is_live,
      stream_url: program.stream_url,
      channel_id: program.channel?.id,
      channel_name: program.channel?.name || null,
    };
  }

  async update(id: number, updateProgramDto: UpdateProgramDto): Promise<any> {
    const program = await this.findProgramEntity(id);
    
    Object.assign(program, updateProgramDto);
    const updatedProgram = await this.programsRepository.save(program);
    await this.redisService.delByPattern('schedules:all:*');
    return {
      id: updatedProgram.id,
      name: updatedProgram.name,
      description: updatedProgram.description,
      panelists: updatedProgram.panelists,
      logo_url: updatedProgram.logo_url,
      youtube_url: updatedProgram.youtube_url,
      is_live: updatedProgram.is_live,
      stream_url: updatedProgram.stream_url,
      channel_id: updatedProgram.channel?.id,
      channel_name: updatedProgram.channel?.name || null,
    };
  }

  async remove(id: number): Promise<void> {
    const result = await this.programsRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Program with ID ${id} not found`);
    }
    await this.redisService.delByPattern('schedules:all:*');
  }

  private async findProgramEntity(id: number): Promise<Program> {
    const program = await this.programsRepository
      .createQueryBuilder('program')
      .leftJoinAndSelect('program.channel', 'channel')
      .leftJoinAndSelect('program.panelists', 'panelists')
      .where('program.id = :id', { id })
      .orderBy('panelists.id', 'ASC')
      .getOne();
    if (!program) {
      throw new NotFoundException(`Program with ID ${id} not found`);
    }
    return program;
  }

  async addPanelist(programId: number, panelistId: number): Promise<void> {
    const program = await this.findProgramEntity(programId);

    const panelist = await this.panelistsRepository.findOne({
      where: { id: panelistId },
    });
    if (!panelist) {
      throw new NotFoundException(`Panelist with ID ${panelistId} not found`);
    }

    if (!program.panelists) {
      program.panelists = [];
    }

    if (!program.panelists.some(p => p.id === panelist.id)) {
      program.panelists.push(panelist);
      await this.programsRepository.save(program);
    }
    await this.redisService.delByPattern('schedules:all:*');
  }

  async removePanelist(programId: number, panelistId: number): Promise<void> {
    const program = await this.findProgramEntity(programId);

    if (program.panelists) {
      program.panelists = program.panelists.filter(p => p.id !== panelistId);
      await this.programsRepository.save(program);
    }
    await this.redisService.delByPattern('schedules:all:*');
  }
}