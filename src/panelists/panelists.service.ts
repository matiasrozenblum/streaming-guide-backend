import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOneOptions, Repository } from 'typeorm';
import { Panelist } from './panelists.entity';
import { CreatePanelistDto } from './dto/create-panelist.dto';

@Injectable()
export class PanelistsService {
  constructor(
    @InjectRepository(Panelist)
    private panelistsRepository: Repository<Panelist>,
  ) {}

  findAll(): Promise<Panelist[]> {
    return this.panelistsRepository.find();
  }

  async findOne(id: string): Promise<Panelist> {
    const channel = await this.panelistsRepository.findOne({ where: { id: Number(id) } } as FindOneOptions );
        if (!channel) {
          throw new NotFoundException(`Channel with ID ${id} not found`);
        }
        return channel;
  }

  create(createPanelistDto: CreatePanelistDto): Promise<Panelist> {
    const channel = this.panelistsRepository.create(createPanelistDto);
    return this.panelistsRepository.save(channel);
  }

  remove(id: string): Promise<void> {
    return this.panelistsRepository.delete(id).then(() => {});
  }
}