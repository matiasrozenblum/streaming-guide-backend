import { Injectable, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOneOptions, Repository } from 'typeorm';
import { Program } from './programs.entity';
import { CreateProgramDto } from './dto/create-program.dto';
import { UpdateProgramDto } from './dto/update-program.dto';
import { Panelist } from '../panelists/panelists.entity';
import { Channel } from '../channels/channels.entity';
import { RedisService } from '../redis/redis.service';
import { WeeklyOverridesService } from '../schedules/weekly-overrides.service';
import { SchedulesService } from '../schedules/schedules.service';
import { NotifyAndRevalidateUtil } from '../utils/notify-and-revalidate.util';

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://staging.laguiadelstreaming.com';
const REVALIDATE_SECRET = process.env.REVALIDATE_SECRET || 'changeme';

@Injectable()
export class ProgramsService {
  private notifyUtil: NotifyAndRevalidateUtil;

  constructor(
    @InjectRepository(Program)
    private programsRepository: Repository<Program>,
    @InjectRepository(Panelist)
    private panelistsRepository: Repository<Panelist>,
    @InjectRepository(Channel)
    private channelsRepository: Repository<Channel>,
    private redisService: RedisService,
    private weeklyOverridesService: WeeklyOverridesService,
    @Inject(forwardRef(() => SchedulesService))
    private schedulesService: SchedulesService,
  ) {
    this.notifyUtil = new NotifyAndRevalidateUtil(
      this.redisService,
      FRONTEND_URL,
      REVALIDATE_SECRET
    );
  }

  async create(createProgramDto: CreateProgramDto): Promise<any> {
    const channelId = createProgramDto.channel_id;

    const channel = await this.channelsRepository.findOne({ where: { id: channelId } });
    if (!channel) {
      throw new NotFoundException(`Channel with ID ${channelId} not found`);
    }

    const program = this.programsRepository.create(createProgramDto);
    program.channel = channel;
    const savedProgram = await this.programsRepository.save(program);
    
    // Clear unified cache
    await this.redisService.del('schedules:week:complete');
    
    // Warm cache asynchronously (non-blocking)
    setImmediate(() => this.schedulesService.warmSchedulesCache());

    // Notify and revalidate
    await this.notifyUtil.notifyAndRevalidate({
      eventType: 'program_created',
      entity: 'program',
      entityId: savedProgram.id,
      payload: { program: savedProgram },
      revalidatePaths: ['/', `/programs/${savedProgram.id}`],
    });

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
      style_override: savedProgram.style_override,
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
      style_override: program.style_override,
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
      style_override: program.style_override,
    };
  }

  async update(id: number, updateProgramDto: UpdateProgramDto): Promise<any> {
    const program = await this.findProgramEntity(id);
    
    // Handle channel_id update separately
    if (updateProgramDto.channel_id !== undefined) {
      const newChannel = await this.channelsRepository.findOne({
        where: { id: updateProgramDto.channel_id }
      });
      if (!newChannel) {
        throw new NotFoundException(`Channel with ID ${updateProgramDto.channel_id} not found`);
      }
      program.channel = newChannel;
      // Remove channel_id from DTO to avoid conflicts with Object.assign
      const { channel_id, ...updateData } = updateProgramDto;
      Object.assign(program, updateData);
    } else {
      // Update other fields normally if no channel_id change
      Object.assign(program, updateProgramDto);
    }
    
    const updatedProgram = await this.programsRepository.save(program);
    
    // Clear unified cache
    await this.redisService.del('schedules:week:complete');
    
    // Warm cache asynchronously (non-blocking)
    setImmediate(() => this.schedulesService.warmSchedulesCache());

    // Notify and revalidate
    await this.notifyUtil.notifyAndRevalidate({
      eventType: 'program_updated',
      entity: 'program',
      entityId: updatedProgram.id,
      payload: { program: updatedProgram },
      revalidatePaths: ['/', `/programs/${updatedProgram.id}`],
    });

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
      style_override: updatedProgram.style_override,
    };
  }

  async remove(id: number): Promise<void> {
    // Get all schedule IDs for this program before deleting
    const program = await this.programsRepository.findOne({ where: { id }, relations: ['schedules'] });
    if (!program) {
      throw new NotFoundException(`Program with ID ${id} not found`);
    }
    const scheduleIds = (program.schedules || []).map(s => s.id);
    // Delete all related weekly overrides
    await this.weeklyOverridesService.deleteOverridesForProgram(id, scheduleIds);
    // Delete the program (cascades schedules, panelists, etc.)
    const result = await this.programsRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Program with ID ${id} not found`);
    }
    
    // Clear unified cache
    await this.redisService.del('schedules:week:complete');
    
    // Warm cache asynchronously (non-blocking)
    setImmediate(() => this.schedulesService.warmSchedulesCache());

    // Notify and revalidate
    await this.notifyUtil.notifyAndRevalidate({
      eventType: 'program_deleted',
      entity: 'program',
      entityId: id,
      payload: {},
      revalidatePaths: ['/'],
    });
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
    
    // Clear unified cache
    await this.redisService.del('schedules:week:complete');
    
    // Warm cache asynchronously (non-blocking)
    setImmediate(() => this.schedulesService.warmSchedulesCache());

    // Notify and revalidate
    await this.notifyUtil.notifyAndRevalidate({
      eventType: 'program_panelist_added',
      entity: 'program',
      entityId: programId,
      payload: { panelistId },
      revalidatePaths: ['/', `/programs/${programId}`],
    });
  }

  async removePanelist(programId: number, panelistId: number): Promise<void> {
    const program = await this.findProgramEntity(programId);

    if (program.panelists) {
      program.panelists = program.panelists.filter(p => p.id !== panelistId);
      await this.programsRepository.save(program);
    }
    
    // Clear unified cache
    await this.redisService.del('schedules:week:complete');
    
    // Warm cache asynchronously (non-blocking)
    setImmediate(() => this.schedulesService.warmSchedulesCache());

    // Notify and revalidate
    await this.notifyUtil.notifyAndRevalidate({
      eventType: 'program_panelist_removed',
      entity: 'program',
      entityId: programId,
      payload: { panelistId },
      revalidatePaths: ['/', `/programs/${programId}`],
    });
  }
}