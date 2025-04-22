import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Channel } from './channels.entity';
import { CreateChannelDto } from './dto/create-channel.dto';
import { UpdateChannelDto } from './dto/update-channel.dto';
import { Program } from '@/programs/programs.entity';
import { Schedule } from '@/schedules/schedules.entity';
import { SchedulesService } from '@/schedules/schedules.service'; // <--- Importar el service

type ChannelWithSchedules = {
  channel: {
    id: number;
    name: string;
    logo_url: string | null;
  };
  schedules: Array<{
    id: number;
    day_of_week: string;
    start_time: string;
    end_time: string;
    program: {
      id: number;
      name: string;
      logo_url: string | null;
      description: string | null;
      stream_url: string | null;
      is_live: boolean;
      panelists: { id: string; name: string }[];
    };
  }>;
};

@Injectable()
export class ChannelsService {
  constructor(
    @InjectRepository(Channel)
    private readonly channelsRepository: Repository<Channel>,
    @InjectRepository(Program)
    private readonly programsRepository: Repository<Program>,
    @InjectRepository(Schedule)
    private readonly scheduleRepo: Repository<Schedule>,
    private readonly dataSource: DataSource,
    private readonly schedulesService: SchedulesService, // <--- Inyectar SchedulesService
  ) {}

  async findAll(): Promise<Channel[]> {
    return this.channelsRepository.find({
      order: { order: 'ASC' },
    });
  }

  async findOne(id: number): Promise<Channel> {
    const channel = await this.channelsRepository.findOne({
      where: { id: id },
      relations: ['programs'],
    });
    if (!channel) {
      throw new NotFoundException(`Channel with ID ${id} not found`);
    }
    return channel;
  }

  async create(createChannelDto: CreateChannelDto): Promise<Channel> {
    const lastChannel = await this.channelsRepository
      .createQueryBuilder('channel')
      .where('channel.order IS NOT NULL')
      .orderBy('channel.order', 'DESC')
      .getOne();
  
    const newOrder = lastChannel ? (lastChannel.order || 0) + 1 : 1;
  
    const channel = this.channelsRepository.create({
      ...createChannelDto,
      order: newOrder,
    });
  
    return this.channelsRepository.save(channel);
  }

  async update(id: number, updateChannelDto: UpdateChannelDto): Promise<Channel> {
    const channel = await this.findOne(id);
    
    Object.keys(updateChannelDto).forEach((key) => {
      if (updateChannelDto[key] !== undefined) {
        channel[key] = updateChannelDto[key];
      }
    });

    return this.channelsRepository.save(channel);
  }

  async remove(id: number): Promise<void> {
    const result = await this.channelsRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Channel with ID ${id} not found`);
    }
  }

  async reorderChannels(newOrderIds: number[]): Promise<void> {
    if (!newOrderIds.length) {
      throw new Error('No channel IDs provided for reordering.');
    }

    await this.dataSource.transaction(async (manager) => {
      for (let i = 0; i < newOrderIds.length; i++) {
        const id = newOrderIds[i];
        const channel = await manager.findOne(Channel, { where: { id } });

        if (!channel) {
          throw new NotFoundException(`Channel with ID ${id} not found`);
        }

        channel.order = i + 1;
        await manager.save(channel);
      }
    });
  }

  async getChannelsWithSchedules(day?: string): Promise<ChannelWithSchedules[]> {
    const channels = await this.channelsRepository.find({
      order: {
        order: 'ASC',
      },
    });

    // ✨ ACA USAMOS schedulesService.findAll en vez de scheduleRepo.find directamente
    const schedules = await this.schedulesService.findAll({
      dayOfWeek: day ? day.toLowerCase() : undefined,
    });

    const schedulesGroupedByChannelId = schedules.reduce((acc, schedule) => {
      const channelId = schedule.program?.channel?.id;
      if (!channelId) return acc;
      if (!acc[channelId]) acc[channelId] = [];
      acc[channelId].push(schedule);
      return acc;
    }, {} as Record<number, any[]>);

    const result: ChannelWithSchedules[] = channels.map((channel) => ({
      channel: {
        id: channel.id,
        name: channel.name,
        logo_url: channel.logo_url,
      },
      schedules: (schedulesGroupedByChannelId[channel.id] || []).map((schedule) => ({
        id: schedule.id,
        day_of_week: schedule.day_of_week,
        start_time: schedule.start_time,
        end_time: schedule.end_time,
        program: {
          id: schedule.program.id,
          name: schedule.program.name,
          logo_url: schedule.program.logo_url,
          description: schedule.program.description,
          stream_url: schedule.program.stream_url,
          is_live: schedule.program.is_live,
          panelists: schedule.program.panelists?.map((p) => ({
            id: p.id.toString(),
            name: p.name,
          })) || [],
        },
      })),
    }));

    return result;
  }
}
