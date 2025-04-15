import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOneOptions, Repository } from 'typeorm';
import { Panelist } from './panelists.entity';
import { CreatePanelistDto } from './dto/create-panelist.dto';
import { UpdatePanelistDto } from './dto/update-panelist.dto';
import { Cache } from 'cache-manager';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Program } from '../programs/programs.entity';

@Injectable()
export class PanelistsService {
  constructor(
    @InjectRepository(Panelist)
    private panelistsRepository: Repository<Panelist>,
    @InjectRepository(Program)
    private programsRepository: Repository<Program>,
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

  async findOne(id: number): Promise<Panelist> {
    const cacheKey = `panelists:${id}`;
    console.log(`[Cache] Attempting to get panelist ${id} from cache`);
    
    let panelist = await this.cacheManager.get<Panelist>(cacheKey);
    if (panelist) {
      console.log(`[Cache] Cache HIT for panelist ${id}`);
      return panelist as Panelist;
    }
    
    console.log(`[Cache] Cache MISS for panelist ${id}, fetching from database`);
    panelist = await this.panelistsRepository.findOne({
      where: { id },
      relations: ['programs'],
      loadEagerRelations: true,
    });
    
    if (!panelist) {
      throw new NotFoundException(`Panelist with ID ${id} not found`);
    }
    
    console.log(`[Cache] Setting cache for panelist ${id}`);
    await this.cacheManager.set(cacheKey, panelist);
    
    return panelist;
  }

  async findByProgram(programId: string): Promise<Panelist[]> {
    return this.panelistsRepository
      .createQueryBuilder('panelist')
      .innerJoin('panelist.programs', 'program')
      .where('program.id = :programId', { programId: Number(programId) })
      .getMany();
  }

  async create(createPanelistDto: CreatePanelistDto): Promise<Panelist> {
    const panelist = this.panelistsRepository.create(createPanelistDto);
    const savedPanelist = await this.panelistsRepository.save(panelist);
    
    // Invalidar caché
    await this.cacheManager.del('panelists:all');
    
    return savedPanelist;
  }

  async update(id: string, updatePanelistDto: UpdatePanelistDto): Promise<Panelist> {
    const panelist = await this.findOne(Number(id));
    if (!panelist) {
      throw new NotFoundException(`Panelist with ID ${id} not found`);
    }
    Object.assign(panelist, updatePanelistDto);
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

  async addToProgram(panelistId: number, programId: number): Promise<void> {
    const panelist = await this.findOne(panelistId);
    if (!panelist) {
      throw new NotFoundException(`Panelist with ID ${panelistId} not found`);
    }

    const program = await this.programsRepository.findOne({
      where: { id: Number(programId) },
    });
    if (!program) {
      throw new NotFoundException(`Program with ID ${programId} not found`);
    }

    if (!panelist.programs) {
      panelist.programs = [];
    }

    if (!panelist.programs.some(p => p.id === program.id)) {
      panelist.programs.push(program);
      await this.panelistsRepository.save(panelist);
      console.log(`[Cache] Invalidating cache for panelist ${panelistId} after adding to program ${programId}`);
      await this.cacheManager.del(`panelists:${panelistId}`);
    }
  }

  async removeFromProgram(panelistId: number, programId: number): Promise<void> {
    const panelist = await this.findOne(panelistId);
    if (!panelist) {
      throw new NotFoundException(`Panelist with ID ${panelistId} not found`);
    }

    if (panelist.programs) {
      panelist.programs = panelist.programs.filter(p => p.id !== Number(programId));
      await this.panelistsRepository.save(panelist);
      console.log(`[Cache] Invalidating cache for panelist ${panelistId} after removing from program ${programId}`);
      await this.cacheManager.del(`panelists:${panelistId}`);
    }
  }

  async clearCache(id: string): Promise<void> {
    await this.cacheManager.del(`panelists:${id}`);
  }
}