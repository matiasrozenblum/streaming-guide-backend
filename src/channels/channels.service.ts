import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOneOptions, Repository } from 'typeorm';
import { Channel } from './channels.entity';
import { CreateChannelDto } from './dto/create-channel.dto';

@Injectable()
export class ChannelsService {
  constructor(
    @InjectRepository(Channel)
    private channelsRepository: Repository<Channel>,
  ) {}

  findAll(): Promise<Channel[]> {
    return this.channelsRepository.find();
  }

  async findOne(id: string): Promise<Channel> {
    const channel = await this.channelsRepository.findOne({ where: { id: Number(id) } });
    if (!channel) {
      throw new NotFoundException(`Channel with ID ${id} not found`);
    }
    return channel;
  }

  create(createChannelDto: CreateChannelDto): Promise<Channel> {
    const channel = this.channelsRepository.create(createChannelDto);
    return this.channelsRepository.save(channel);
  }

  remove(id: string): Promise<void> {
    return this.channelsRepository.delete(id).then(() => {});
  }
}