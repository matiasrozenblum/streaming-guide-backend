import {
  Injectable,
  NotFoundException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOneOptions, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { Program } from './programs.entity';
import { CreateProgramDto } from './dto/create-program.dto';
import { CreateBulkProgramsDto } from './dto/create-bulk-programs.dto';
import { UpdateProgramDto } from './dto/update-program.dto';
import { Panelist } from '../panelists/panelists.entity';
import { Channel } from '../channels/channels.entity';
import { Schedule } from '../schedules/schedules.entity';
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
    @InjectRepository(Schedule)
    private schedulesRepository: Repository<Schedule>,
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
      link_group_id: savedProgram.link_group_id ?? null,
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

    // Generate a shared UUID when creating for multiple channels so programs are linked
    const linkGroupId = dto.channel_ids.length > 1 ? randomUUID() : null;

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
        link_group_id: linkGroupId,
        channel,
      }),
    );

    const savedPrograms = await this.programsRepository.save(programs);

    // Assign panelists to all created programs if provided
    if (dto.panelist_ids && dto.panelist_ids.length > 0) {
      const panelists = await Promise.all(
        dto.panelist_ids.map((pid) =>
          this.panelistsRepository.findOne({ where: { id: pid } }),
        ),
      );
      const validPanelists = panelists.filter(Boolean) as Panelist[];
      if (validPanelists.length > 0) {
        for (const program of savedPrograms) {
          program.panelists = validPanelists;
        }
        await this.programsRepository.save(savedPrograms);
      }
    }

    // Create schedules for each program if provided (skip link propagation — all programs handled here)
    if (dto.schedules && dto.schedules.length > 0) {
      await Promise.all(
        savedPrograms.map((program) =>
          this.schedulesService.createBulk({
            programId: program.id.toString(),
            channelId: program.channel!.id.toString(),
            schedules: dto.schedules!,
            skipLinkPropagation: true,
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
      link_group_id: p.link_group_id ?? null,
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
      link_group_id: program.link_group_id ?? null,
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
      link_group_id: program.link_group_id ?? null,
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
      const { channel_id, ...updateData } = updateProgramDto;
      Object.assign(program, updateData);
    } else {
      Object.assign(program, updateProgramDto);
    }

    const updatedProgram = await this.programsRepository.save(program);

    // Propagate metadata changes to all linked programs (never propagate channel_id)
    if (updatedProgram.link_group_id) {
      const { channel_id: _cid, ...fieldsToPropagate } = updateProgramDto;
      const linkedPrograms = await this.programsRepository.find({
        where: { link_group_id: updatedProgram.link_group_id },
        relations: ['channel'],
      });
      const othersToUpdate = linkedPrograms.filter((p) => p.id !== id);
      if (othersToUpdate.length > 0) {
        for (const linked of othersToUpdate) {
          Object.assign(linked, fieldsToPropagate);
        }
        await this.programsRepository.save(othersToUpdate);
        await this.redisService.del(
          othersToUpdate.map((p) => `programs:${p.id}`),
        );
      }
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
      link_group_id: updatedProgram.link_group_id ?? null,
    };
  }

  async remove(id: number, deleteLinked = false): Promise<void> {
    const program = await this.programsRepository.findOne({
      where: { id },
      relations: ['schedules'],
    });
    if (!program) {
      throw new NotFoundException(`Program with ID ${id} not found`);
    }

    // If deleteLinked, delete every program in the group (including this one)
    if (deleteLinked && program.link_group_id) {
      const group = await this.programsRepository.find({
        where: { link_group_id: program.link_group_id },
        select: ['id'],
      });
      await Promise.all(group.map((p) => this.remove(p.id, false)));
      return;
    }

    const scheduleIds = (program.schedules || []).map((s) => s.id);
    await this.weeklyOverridesService.deleteOverridesForProgram(
      id,
      scheduleIds,
    );
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

    if (!program.panelists) program.panelists = [];
    if (!program.panelists.some((p) => p.id === panelist.id)) {
      program.panelists.push(panelist);
      await this.programsRepository.save(program);
    }

    // Propagate to linked programs
    if (program.link_group_id) {
      const linked = await this.programsRepository.find({
        where: { link_group_id: program.link_group_id },
        relations: ['panelists'],
      });
      const others = linked.filter((p) => p.id !== programId);
      for (const other of others) {
        if (!other.panelists) other.panelists = [];
        if (!other.panelists.some((p) => p.id === panelistId)) {
          other.panelists.push(panelist);
          await this.programsRepository.save(other);
          await this.redisService.del([`programs:${other.id}`]);
        }
      }
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

    // Propagate to linked programs
    if (program.link_group_id) {
      const linked = await this.programsRepository.find({
        where: { link_group_id: program.link_group_id },
        relations: ['panelists'],
      });
      const others = linked.filter((p) => p.id !== programId);
      for (const other of others) {
        if (other.panelists) {
          other.panelists = other.panelists.filter((p) => p.id !== panelistId);
          await this.programsRepository.save(other);
          await this.redisService.del([`programs:${other.id}`]);
        }
      }
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
