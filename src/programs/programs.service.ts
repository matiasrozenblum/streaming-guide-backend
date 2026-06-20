import {
  Injectable,
  NotFoundException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOneOptions, Repository } from 'typeorm';
import { Program } from './programs.entity';
import { CreateProgramDto } from './dto/create-program.dto';
import { CreateBulkProgramsDto } from './dto/create-bulk-programs.dto';
import { UpdateProgramDto } from './dto/update-program.dto';
import { Panelist } from '../panelists/panelists.entity';
import { Channel } from '../channels/channels.entity';
import { RedisService } from '../redis/redis.service';
import { WeeklyOverridesService } from '../schedules/weekly-overrides.service';
import { SchedulesService } from '../schedules/schedules.service';
import { NotifyAndRevalidateUtil } from '../utils/notify-and-revalidate.util';

const FRONTEND_URL =
  process.env.FRONTEND_URL || 'https://staging.laguiadelstreaming.com';
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
      REVALIDATE_SECRET,
    );
  }

  async create(createProgramDto: CreateProgramDto): Promise<any> {
    const channelId = createProgramDto.channel_id;

    const channel = await this.channelsRepository.findOne({
      where: { id: channelId },
    });
    if (!channel) {
      throw new NotFoundException(`Channel with ID ${channelId} not found`);
    }

    const program = this.programsRepository.create(createProgramDto);
    program.channel = channel;
    const savedProgram = await this.programsRepository.save(program);

    // Clear caches
    await this.redisService.del(['schedules:week:complete', 'programs:all']);

    // Warm cache asynchronously (non-blocking)
    this.schedulesService.debouncedWarmSchedulesCache();

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
      is_visible: savedProgram.is_visible,
      is_premiere: savedProgram.is_premiere,
      channel_id: savedProgram.channel?.id,
      channel_name: savedProgram.channel?.name || null,
      style_override: savedProgram.style_override,
    };
  }

  async createBulk(dto: CreateBulkProgramsDto): Promise<any[]> {
    // Validate all channels exist in parallel
    const channelResults = await Promise.all(
      dto.channel_ids.map((id) =>
        this.channelsRepository.findOne({ where: { id } }),
      ),
    );

    const missingIds = dto.channel_ids.filter((_, i) => !channelResults[i]);
    if (missingIds.length > 0) {
      throw new NotFoundException(
        `Channels not found: ${missingIds.join(', ')}`,
      );
    }

    const channels = channelResults as NonNullable<(typeof channelResults)[0]>[];

    // Batch-create one Program entity per channel
    const programs = channels.map((channel) =>
      this.programsRepository.create({
        name: dto.name,
        description: dto.description,
        logo_url: dto.logo_url ?? null,
        youtube_url: dto.youtube_url ?? null,
        style_override: dto.style_override ?? null,
        is_visible: dto.is_visible ?? true,
        is_premiere: dto.is_premiere ?? false,
        channel,
      }),
    );

    const savedPrograms = await this.programsRepository.save(programs);

    // Create schedules for each program if provided (debounce collapses warm calls)
    if (dto.schedules && dto.schedules.length > 0) {
      await Promise.all(
        savedPrograms.map((program) =>
          this.schedulesService.createBulk({
            programId: program.id.toString(),
            channelId: program.channel!.id.toString(),
            schedules: dto.schedules!,
          }),
        ),
      );
    }

    // Clear caches once for all created programs
    await this.redisService.del(['schedules:week:complete', 'programs:all']);
    this.schedulesService.debouncedWarmSchedulesCache();

    await this.notifyUtil.notifyAndRevalidate({
      eventType: 'programs_bulk_created',
      entity: 'program',
      entityId: 'bulk',
      payload: { count: savedPrograms.length },
      revalidatePaths: ['/'],
    });

    return savedPrograms.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      logo_url: p.logo_url,
      youtube_url: p.youtube_url,
      is_live: p.is_live,
      stream_url: p.stream_url,
      is_visible: p.is_visible,
      is_premiere: p.is_premiere,
      channel_id: p.channel?.id,
      channel_name: p.channel?.name || null,
      style_override: p.style_override,
    }));
  }

  async findAll(): Promise<any[]> {
    const cacheKey = 'programs:all';
    const cached = await this.redisService.get<any[]>(cacheKey);
    if (cached) return cached;

    const programs = await this.programsRepository
      .createQueryBuilder('program')
      .leftJoinAndSelect('program.channel', 'channel')
      .leftJoinAndSelect('program.panelists', 'panelists')
      .orderBy('panelists.id', 'ASC')
      .getMany();
    const result = programs.map((program) => ({
      id: program.id,
      name: program.name,
      description: program.description,
      panelists: program.panelists,
      logo_url: program.logo_url,
      youtube_url: program.youtube_url,
      is_live: program.is_live,
      stream_url: program.stream_url,
      is_visible: program.is_visible,
      is_premiere: program.is_premiere,
      channel_id: program.channel?.id,
      channel_name: program.channel?.name || null,
      style_override: program.style_override,
    }));
    await this.redisService.set(cacheKey, result, 300);
    return result;
  }

  async findOne(id: number): Promise<any> {
    const cacheKey = `programs:${id}`;
    const cached = await this.redisService.get<any>(cacheKey);
    if (cached) return cached;

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
    const result = {
      id: program.id,
      name: program.name,
      description: program.description,
      panelists: program.panelists,
      logo_url: program.logo_url,
      youtube_url: program.youtube_url,
      is_live: program.is_live,
      stream_url: program.stream_url,
      is_visible: program.is_visible,
      is_premiere: program.is_premiere,
      channel_id: program.channel?.id,
      channel_name: program.channel?.name || null,
      style_override: program.style_override,
    };
    await this.redisService.set(cacheKey, result, 300);
    return result;
  }

  async update(id: number, updateProgramDto: UpdateProgramDto): Promise<any> {
    const program = await this.findProgramEntity(id);

    // Handle channel_id update separately
    if (updateProgramDto.channel_id !== undefined) {
      const newChannel = await this.channelsRepository.findOne({
        where: { id: updateProgramDto.channel_id },
      });
      if (!newChannel) {
        throw new NotFoundException(
          `Channel with ID ${updateProgramDto.channel_id} not found`,
        );
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

    // Clear caches
    await this.redisService.del([
      'schedules:week:complete',
      'programs:all',
      `programs:${id}`,
    ]);

    // Warm cache asynchronously (non-blocking)
    this.schedulesService.debouncedWarmSchedulesCache();

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
      is_visible: updatedProgram.is_visible,
      is_premiere: updatedProgram.is_premiere,
      channel_id: updatedProgram.channel?.id,
      channel_name: updatedProgram.channel?.name || null,
      style_override: updatedProgram.style_override,
    };
  }

  async remove(id: number): Promise<void> {
    // Get all schedule IDs for this program before deleting
    const program = await this.programsRepository.findOne({
      where: { id },
      relations: ['schedules'],
    });
    if (!program) {
      throw new NotFoundException(`Program with ID ${id} not found`);
    }
    const scheduleIds = (program.schedules || []).map((s) => s.id);
    // Delete all related weekly overrides
    await this.weeklyOverridesService.deleteOverridesForProgram(
      id,
      scheduleIds,
    );
    // Delete the program (cascades schedules, panelists, etc.)
    const result = await this.programsRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Program with ID ${id} not found`);
    }

    // Clear caches
    await this.redisService.del([
      'schedules:week:complete',
      'programs:all',
      `programs:${id}`,
    ]);

    // Warm cache asynchronously (non-blocking)
    this.schedulesService.debouncedWarmSchedulesCache();

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

    if (!program.panelists.some((p) => p.id === panelist.id)) {
      program.panelists.push(panelist);
      await this.programsRepository.save(program);
    }

    // Clear caches
    await this.redisService.del([
      'schedules:week:complete',
      'programs:all',
      `programs:${programId}`,
    ]);

    // Warm cache asynchronously (non-blocking)
    this.schedulesService.debouncedWarmSchedulesCache();

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
      program.panelists = program.panelists.filter((p) => p.id !== panelistId);
      await this.programsRepository.save(program);
    }

    // Clear caches
    await this.redisService.del([
      'schedules:week:complete',
      'programs:all',
      `programs:${programId}`,
    ]);

    // Warm cache asynchronously (non-blocking)
    this.schedulesService.debouncedWarmSchedulesCache();

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
