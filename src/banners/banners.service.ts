import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual, LessThanOrEqual, IsNull, QueryFailedError } from 'typeorm';
import { Banner } from './banners.entity';
import { CreateBannerDto } from './dto/create-banner.dto';
import { UpdateBannerDto } from './dto/update-banner.dto';
import { ReorderBannersDto } from './dto/reorder-banners.dto';

@Injectable()
export class BannersService {
  private readonly logger = new Logger(BannersService.name);

  constructor(
    @InjectRepository(Banner)
    private readonly bannersRepository: Repository<Banner>,
  ) {}

  /**
   * Find all active banners with fixed/timed logic and priority ordering
   * - Timed banners: filtered by date range, sorted by priority
   * - Fixed banners: filtered by is_enabled, sorted by priority
   * - Auto-activation: ensures minimum 2 banners visible (max 2 fixed auto-enabled)
   * Used by public API endpoint
   * Gracefully handles case where banner table doesn't exist yet (returns empty array)
   */
  async findAllActive(): Promise<Banner[]> {
    try {
      const now = new Date();
      
      // Get all banners (we'll filter and sort in memory for complex logic)
      const allBanners = await this.bannersRepository.find();
      
      // Separate into timed and fixed banners
      const timedBanners = allBanners.filter(banner => !banner.is_fixed);
      const fixedBanners = allBanners.filter(banner => banner.is_fixed);
      
      // Filter timed banners: must be enabled and within date range
      const activeTimedBanners = timedBanners.filter(banner => {
        if (!banner.is_enabled) return false;
        if (banner.start_date && banner.start_date > now) return false;
        if (banner.end_date && banner.end_date < now) return false;
        return true;
      });
      
      // Sort timed banners by priority ASC
      activeTimedBanners.sort((a, b) => a.priority - b.priority);
      
      // Filter fixed banners: only those explicitly enabled
      const enabledFixedBanners = fixedBanners.filter(banner => banner.is_enabled);
      
      // Sort fixed banners by priority ASC
      enabledFixedBanners.sort((a, b) => a.priority - b.priority);
      
      // Auto-activation logic: ensure minimum 2 banners visible
      const totalActive = activeTimedBanners.length + enabledFixedBanners.length;
      const MIN_BANNERS = 2;
      const MAX_AUTO_FIXED = 2; // Never auto-enable more than 2 fixed banners
      
      let autoEnabledFixed: Banner[] = [];
      
      if (totalActive < MIN_BANNERS) {
        // Get disabled fixed banners, sorted by priority
        const disabledFixedBanners = fixedBanners
          .filter(banner => !banner.is_enabled)
          .sort((a, b) => a.priority - b.priority);
        
        // Auto-enable fixed banners until we have at least MIN_BANNERS
        // But never more than MAX_AUTO_FIXED fixed banners total (including already enabled)
        const currentlyEnabledFixedCount = enabledFixedBanners.length;
        const canAutoEnable = Math.min(
          MIN_BANNERS - totalActive, // How many we need
          MAX_AUTO_FIXED - currentlyEnabledFixedCount // How many we can auto-enable
        );
        
        if (canAutoEnable > 0) {
          autoEnabledFixed = disabledFixedBanners.slice(0, canAutoEnable);
          
          // Update database to enable these banners
          for (const banner of autoEnabledFixed) {
            banner.is_enabled = true;
            await this.bannersRepository.save(banner);
          }
          
          this.logger.debug(
            `Auto-enabled ${autoEnabledFixed.length} fixed banner(s) to meet minimum requirement: ${autoEnabledFixed.map(b => b.id).join(', ')}`
          );
        }
      }
      
      // Combine all fixed banners (enabled + auto-enabled)
      const allActiveFixedBanners = [...enabledFixedBanners, ...autoEnabledFixed];
      allActiveFixedBanners.sort((a, b) => a.priority - b.priority);
      
      // Return: timed first, then fixed, both sorted by priority
      return [...activeTimedBanners, ...allActiveFixedBanners];
    } catch (error) {
      // Handle case where banner table doesn't exist yet (e.g., migration not run)
      if (error instanceof QueryFailedError && (error as any).code === '42P01') {
        this.logger.debug('Banner table does not exist yet, returning empty array');
        return [];
      }
      // Re-throw other errors
      throw error;
    }
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

    // If banner is fixed, clear dates and ignore date validation
    const isFixed = createBannerDto.is_fixed ?? false;
    if (isFixed) {
      createBannerDto.start_date = undefined;
      createBannerDto.end_date = undefined;
    } else {
      // For timed banners, validate date range
      if (createBannerDto.start_date && createBannerDto.end_date) {
        const startDate = new Date(createBannerDto.start_date);
        const endDate = new Date(createBannerDto.end_date);
        
        if (startDate >= endDate) {
          throw new BadRequestException('start_date must be before end_date');
        }
      }
      
      // Timed banners require both start and end dates
      if (!createBannerDto.start_date || !createBannerDto.end_date) {
        throw new BadRequestException('start_date and end_date are required for timed banners');
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

    // If no priority is provided, set it to the highest existing priority + 1
    if (createBannerDto.priority === undefined) {
      const maxPriority = await this.bannersRepository
        .createQueryBuilder('banner')
        .select('MAX(banner.priority)', 'max')
        .getRawOne();
      
      createBannerDto.priority = (maxPriority?.max || 0) + 1;
    }

    const banner = this.bannersRepository.create({
      ...createBannerDto,
      is_fixed: isFixed,
      start_date: isFixed ? null : (createBannerDto.start_date ? new Date(createBannerDto.start_date) : null),
      end_date: isFixed ? null : (createBannerDto.end_date ? new Date(createBannerDto.end_date) : null),
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

    // Determine if banner is being changed to/from fixed
    const isFixed = updateBannerDto.is_fixed !== undefined ? updateBannerDto.is_fixed : banner.is_fixed;
    
    if (isFixed) {
      // Fixed banners: clear dates
      updateBannerDto.start_date = undefined;
      updateBannerDto.end_date = undefined;
      banner.start_date = null;
      banner.end_date = null;
    } else {
      // Timed banners: validate date range
      const startDate = updateBannerDto.start_date ? new Date(updateBannerDto.start_date) : banner.start_date;
      const endDate = updateBannerDto.end_date ? new Date(updateBannerDto.end_date) : banner.end_date;
      
      if (startDate && endDate && startDate >= endDate) {
        throw new BadRequestException('start_date must be before end_date');
      }
      
      // If changing from fixed to timed, require dates
      if (banner.is_fixed && (!startDate || !endDate)) {
        throw new BadRequestException('start_date and end_date are required for timed banners');
      }
    }

    // Update the banner
    Object.assign(banner, {
      ...updateBannerDto,
      is_fixed: isFixed,
      start_date: isFixed ? null : (updateBannerDto.start_date ? new Date(updateBannerDto.start_date) : banner.start_date),
      end_date: isFixed ? null : (updateBannerDto.end_date ? new Date(updateBannerDto.end_date) : banner.end_date),
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
