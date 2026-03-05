import { Controller, Post, Delete, Get, Param, Body, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { StreamerSubscriptionService } from './streamer-subscription.service';
import { CreateStreamerSubscriptionDto } from './dto/create-streamer-subscription.dto';

@ApiTags('streamers-subscriptions')
@Controller('streamers')
export class StreamerSubscriptionController {
    constructor(private readonly subscriptionService: StreamerSubscriptionService) { }

    @Post(':id/subscribe')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Subscribe to streamer notifications' })
    @ApiResponse({ status: 201, description: 'Subscription created' })
    async subscribe(
        @Request() req,
        @Param('id') id: number,
        @Body() dto: CreateStreamerSubscriptionDto,
    ) {
        return this.subscriptionService.subscribe(req.user, id, dto);
    }

    @Delete(':id/unsubscribe')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Unsubscribe from streamer notifications' })
    @ApiResponse({ status: 200, description: 'Subscription removed' })
    async unsubscribe(@Request() req, @Param('id') id: number) {
        return this.subscriptionService.unsubscribe(req.user, id);
    }

    @Get('subscriptions/my')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Get current user subscriptions (streamer IDs)' })
    @ApiResponse({ status: 200, description: 'List of subscribed streamer IDs', type: [Number] })
    async getMySubscriptions(@Request() req) {
        return this.subscriptionService.getUserSubscriptions(req.user.id);
    }
}
