import { Controller, Post, Body, Patch, Param, Delete, UseGuards, ParseIntPipe } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SubscriptionService, UpdateSubscriptionDto } from './subscription.service';
class AdminCreateSubscriptionDto {
  userId: number;
  programId: number;
}

@Controller('admin/subscriptions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminSubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) { }

  @Post()
  create(@Body() dto: AdminCreateSubscriptionDto) {
    return this.subscriptionService.adminCreateSubscription(dto.userId, dto.programId);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateSubscriptionDto) {
    return this.subscriptionService.adminUpdateSubscription(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.subscriptionService.adminRemoveSubscription(id);
  }
} 