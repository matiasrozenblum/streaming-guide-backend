import { IsArray, IsInt, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class BannerOrderItem {
  @ApiProperty({ description: 'Banner ID' })
  @IsInt()
  id: number;

  @ApiProperty({ description: 'New display order' })
  @IsInt()
  display_order: number;
}

export class ReorderBannersDto {
  @ApiProperty({ 
    description: 'Array of banner order items',
    type: [BannerOrderItem]
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BannerOrderItem)
  banners: BannerOrderItem[];
}
