import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOneOptions, Repository } from 'typeorm';
import { Panelist } from './panelists.entity';
import { CreatePanelistDto } from './dto/create-panelist.dto';
import { UpdatePanelistDto } from './dto/update-panelist.dto';
import { Cache } from 'cache-manager';
import { CACHE_MANAGER } from '@nestjs/cache-manager';

@Injectable()
export class PanelistsService {
  constructor(
    @InjectRepository(Panelist)
    private panelistsRepository: Repository<Panelist>,
    @Inject(CACHE_MANAGER)
    private cacheManager: Cache,
  ) {}

  async findAll(): Promise<Panelist[]> {
    const startTime = Date.now();
    const cacheKey = 'panelists:all';
    const cachedPanelists = await this.cacheManager.get<Panelist[]>(cacheKey);

    if (cachedPanelists) {
      console.log(`Cache HIT for ${cacheKey}. Time: ${Date.now() - startTime}ms`);
      return cachedPanelists;
    }

    console.log(`Cache MISS for ${cacheKey}`);
    const panelists = await this.panelistsRepository.find({
      relations: ['programs'],
    });

    await this.cacheManager.set(cacheKey, panelists, 3600);
    console.log(`Database query completed. Total time: ${Date.now() - startTime}ms`);
    return panelists;
  }

  async findOne(id: string): Promise<Panelist> {
    const startTime = Date.now();
    const cacheKey = `panelists:${id}`;
    const cachedPanelist = await this.cacheManager.get<Panelist>(cacheKey);

    if (cachedPanelist) {
      console.log(`Cache HIT for ${cacheKey}. Time: ${Date.now() - startTime}ms`);
      return cachedPanelist;
    }

    console.log(`Cache MISS for ${cacheKey}`);
    const panelist = await this.panelistsRepository.findOne({
      where: { id: Number(id) },
      relations: ['programs'],
    });

    if (!panelist) {
      throw new NotFoundException(`Panelist with ID ${id} not found`);
    }

    await this.cacheManager.set(cacheKey, panelist);
    console.log(`Database query completed. Total time: ${Date.now() - startTime}ms`);
    return panelist;
  }

  async findByProgram(programId: string): Promise<Panelist[]> {
    return this.panelistsRepository.find({
      where: { programs: { id: Number(programId) } },
      relations: ['programs'],
    });
  }

  async create(createPanelistDto: CreatePanelistDto): Promise<Panelist> {
    const panelist = this.panelistsRepository.create({
      name: createPanelistDto.name,
      bio: createPanelistDto.bio,
    });

    const savedPanelist = await this.panelistsRepository.save(panelist);
    
    // Invalidar caché
    await this.cacheManager.del('panelists:all');
    
    return savedPanelist;
  }

  async update(id: string, updatePanelistDto: UpdatePanelistDto): Promise<Panelist> {
    const panelist = await this.findOne(id);
    if (!panelist) {
      throw new NotFoundException(`Panelist with ID ${id} not found`);
    }

    if (updatePanelistDto.name) {
      panelist.name = updatePanelistDto.name;
    }
    if (updatePanelistDto.photo_url) {
      panelist.photo_url = updatePanelistDto.photo_url;
    }
    if (updatePanelistDto.bio) {
      panelist.bio = updatePanelistDto.bio;
    }

    const updatedPanelist = await this.panelistsRepository.save(panelist);
    
    // Invalidar caché
    await Promise.all([
      this.cacheManager.del('panelists:all'),
      this.cacheManager.del(`panelists:${id}`),
    ]);
    
    return updatedPanelist;
  }

  async remove(id: string): Promise<boolean> {
    const result = await this.panelistsRepository.delete(id);
    const affected = result?.affected ?? 0;
    if (affected > 0) {
      await Promise.all([
        this.cacheManager.del('panelists:all'),
        this.cacheManager.del(`panelists:${id}`),
      ]);
      return true;
    }
    return false;
  }
}