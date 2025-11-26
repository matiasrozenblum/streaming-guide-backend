import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual, LessThanOrEqual, IsNull } from 'typeorm';
import { Banner } from './banners.entity';
import { CreateBannerDto } from './dto/create-banner.dto';
import { UpdateBannerDto } from './dto/update-banner.dto';
import { ReorderBannersDto } from './dto/reorder-banners.dto';

@Injectable()
export class BannersService {
  constructor(
    @InjectRepository(Banner)
    private readonly bannersRepository: Repository<Banner>,
  ) {}

  /**
   * Find all active banners (enabled and within date range if specified)
   * Used by public API endpoint
   */
  async findAllActive(): Promise<Banner[]> {
    const now = new Date();
    
    const queryBuilder = this.bannersRepository
      .createQueryBuilder('banner')
      .where('banner.is_enabled = :enabled', { enabled: true })
      .andWhere(
        '(banner.start_date IS NULL OR banner.start_date <= :now)',
        { now }
      )
      .andWhere(
        '(banner.end_date IS NULL OR banner.end_date >= :now)',
        { now }
      )
      .orderBy('banner.display_order', 'ASC')
      .addOrderBy('banner.created_at', 'DESC');

    return queryBuilder.getMany();
  }

  /**
   * Find all banners (admin endpoint)
   */
  async findAll(): Promise<Banner[]> {
    return this.bannersRepository.find({
      order: {
        display_order: 'ASC',
        created_at: 'DESC',
      },
    });
  }

  /**
   * Find a single banner by ID
   */
  async findOne(id: number): Promise<Banner> {
    const banner = await this.bannersRepository.findOne({
      where: { id },
    });

    if (!banner) {
      throw new NotFoundException(`Banner with ID ${id} not found`);
    }

    return banner;
  }

  /**
   * Create a new banner
   */
  async create(createBannerDto: CreateBannerDto): Promise<Banner> {
    // Validate link_url is provided when link_type is not 'none'
    if (createBannerDto.link_type && createBannerDto.link_type !== 'none') {
      if (!createBannerDto.link_url) {
        throw new BadRequestException('link_url is required when link_type is not "none"');
      }
    }

    // Validate date range
    if (createBannerDto.start_date && createBannerDto.end_date) {
      const startDate = new Date(createBannerDto.start_date);
      const endDate = new Date(createBannerDto.end_date);
      
      if (startDate >= endDate) {
        throw new BadRequestException('start_date must be before end_date');
      }
    }

    // If no display_order is provided, set it to the highest existing order + 1
    if (createBannerDto.display_order === undefined) {
      const maxOrder = await this.bannersRepository
        .createQueryBuilder('banner')
        .select('MAX(banner.display_order)', 'max')
        .getRawOne();
      
      createBannerDto.display_order = (maxOrder?.max || 0) + 1;
    }

    const banner = this.bannersRepository.create({
      ...createBannerDto,
      start_date: createBannerDto.start_date ? new Date(createBannerDto.start_date) : null,
      end_date: createBannerDto.end_date ? new Date(createBannerDto.end_date) : null,
    });

    return this.bannersRepository.save(banner);
  }

  /**
   * Update an existing banner
   */
  async update(id: number, updateBannerDto: UpdateBannerDto): Promise<Banner> {
    const banner = await this.findOne(id);

    // Validate link_url is provided when link_type is not 'none'
    const linkType = updateBannerDto.link_type || banner.link_type;
    const linkUrl = updateBannerDto.link_url !== undefined ? updateBannerDto.link_url : banner.link_url;
    
    if (linkType && linkType !== 'none' && !linkUrl) {
      throw new BadRequestException('link_url is required when link_type is not "none"');
    }

    // Validate date range
    const startDate = updateBannerDto.start_date ? new Date(updateBannerDto.start_date) : banner.start_date;
    const endDate = updateBannerDto.end_date ? new Date(updateBannerDto.end_date) : banner.end_date;
    
    if (startDate && endDate && startDate >= endDate) {
      throw new BadRequestException('start_date must be before end_date');
    }

    // Update the banner
    Object.assign(banner, {
      ...updateBannerDto,
      start_date: updateBannerDto.start_date ? new Date(updateBannerDto.start_date) : banner.start_date,
      end_date: updateBannerDto.end_date ? new Date(updateBannerDto.end_date) : banner.end_date,
    });

    return this.bannersRepository.save(banner);
  }

  /**
   * Remove a banner
   */
  async remove(id: number): Promise<void> {
    const banner = await this.findOne(id);
    await this.bannersRepository.remove(banner);
  }

  /**
   * Reorder multiple banners
   */
  async reorder(reorderDto: ReorderBannersDto): Promise<Banner[]> {
    const { banners } = reorderDto;

    // Validate all banner IDs exist
    const bannerIds = banners.map(b => b.id);
    const existingBanners = await this.bannersRepository.findByIds(bannerIds);
    
    if (existingBanners.length !== bannerIds.length) {
      const foundIds = existingBanners.map(b => b.id);
      const missingIds = bannerIds.filter(id => !foundIds.includes(id));
      throw new NotFoundException(`Banners with IDs ${missingIds.join(', ')} not found`);
    }

    // Update display orders
    const updatePromises = banners.map(({ id, display_order }) =>
      this.bannersRepository.update(id, { display_order })
    );

    await Promise.all(updatePromises);

    // Return updated banners in order
    return this.findAll();
  }

  /**
   * Get banner statistics
   */
  async getStats(): Promise<{
    total: number;
    active: number;
    byType: Record<string, number>;
  }> {
    const total = await this.bannersRepository.count();
    const active = await this.bannersRepository.count({
      where: { is_enabled: true },
    });

    const byTypeQuery = await this.bannersRepository
      .createQueryBuilder('banner')
      .select('banner.banner_type', 'type')
      .addSelect('COUNT(*)', 'count')
      .groupBy('banner.banner_type')
      .getRawMany();

    const byType = byTypeQuery.reduce((acc, { type, count }) => {
      acc[type] = parseInt(count, 10);
      return acc;
    }, {});

    return {
      total,
      active,
      byType,
    };
  }
}
