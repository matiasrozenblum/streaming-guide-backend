import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Channel } from './channels.entity';
import { CreateChannelDto } from './dto/create-channel.dto';
import { UpdateChannelDto } from './dto/update-channel.dto';

@Injectable()
export class ChannelsService {
  constructor(
    @InjectRepository(Channel)
    private readonly channelsRepository: Repository<Channel>,
    private readonly dataSource: DataSource,
  ) {}

  async findAll(): Promise<Channel[]> {
    return this.channelsRepository.find({
      order: { order: 'ASC' },
    });
  }

  async findOne(id: string): Promise<Channel> {
    const channel = await this.channelsRepository.findOne({
      where: { id: parseInt(id) },
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

  async update(id: string, updateChannelDto: UpdateChannelDto): Promise<Channel> {
    const channel = await this.findOne(id);
    
    // Only update fields that are provided
    Object.keys(updateChannelDto).forEach((key) => {
      if (updateChannelDto[key] !== undefined) {
        channel[key] = updateChannelDto[key];
      }
    });

    return this.channelsRepository.save(channel);
  }

  async remove(id: string): Promise<void> {
    const result = await this.channelsRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Channel with ID ${id} not found`);
    }
  }

  async reorderChannels(newOrderIds: number[]): Promise<void> {
    if (!newOrderIds.length) {
      throw new Error('No channel IDs provided for reordering.');
    }

    // Transactional update
    await this.dataSource.transaction(async (manager) => {
      for (let i = 0; i < newOrderIds.length; i++) {
        const id = newOrderIds[i];
        const channel = await manager.findOne(Channel, { where: { id } });

        if (!channel) {
          throw new NotFoundException(`Channel with ID ${id} not found`);
        }

        channel.order = i + 1; // Primero recibe order=1, segundo order=2, etc
        await manager.save(channel);
      }
    });
  }
}