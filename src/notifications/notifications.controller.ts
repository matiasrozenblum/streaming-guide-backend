import { Controller, Get, Post, Delete, Body, Param, Query } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

@Controller('preferences')
export class NotificationsController {
  constructor(private svc: NotificationsService) {}

  // GET /preferences
  @Get()
  list(@Query('deviceId') deviceId: string) {
    return this.svc.list(deviceId);
  }

  // POST /preferences/:programId
  @Post(':programId')
  subscribe(
    @Param('programId') programId: number,
    @Body('deviceId') deviceId: string,
  ) {
    return this.svc.subscribe(deviceId, programId);
  }

  // DELETE /preferences/:programId
  @Delete(':programId')
  unsubscribe(
    @Param('programId') programId: number,
    @Body('deviceId') deviceId: string,
  ) {
    return this.svc.unsubscribe(deviceId, programId);
  }
}