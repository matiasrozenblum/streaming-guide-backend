import { Controller, Get, Post, Body, Param, Delete, Patch, UseGuards, NotFoundException, Request, UnauthorizedException } from '@nestjs/common';
import { ProgramsService } from './programs.service';
import { CreateProgramDto } from './dto/create-program.dto';
import { Program } from './programs.entity';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { UpdateProgramDto } from './dto/update-program.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Panelist } from '../panelists/panelists.entity';
import { SubscriptionService } from '../users/subscription.service';
import { NotificationMethod } from '../users/user-subscription.entity';

@ApiTags('programs')  // Etiqueta para los programas
@Controller('programs')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ProgramsController {
  constructor(
    private readonly programsService: ProgramsService,
    private readonly subscriptionService: SubscriptionService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get all programs' })
  @ApiResponse({ status: 200, description: 'Return all programs.' })
  findAll(): Promise<Program[]> {
    return this.programsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a program by id' })
  @ApiResponse({ status: 200, description: 'Return the program.' })
  @ApiResponse({ status: 404, description: 'Program not found.' })
  findOne(@Param('id') id: string): Promise<Program> {
    return this.programsService.findOne(Number(id));
  }

  @Get(':id/subscription-status')
  @ApiOperation({ summary: 'Get user subscription status for a program' })
  @ApiResponse({ status: 200, description: 'Return subscription status.' })
  async getSubscriptionStatus(
    @Request() req: any,
    @Param('id') id: string,
  ) {
    const user = req.user;
    const isSubscribed = await this.subscriptionService.isUserSubscribedToProgram(
      user.id,
      Number(id),
    );
    
    return {
      isSubscribed,
      programId: Number(id),
    };
  }

  @Post(':id/subscribe')
  @ApiOperation({ summary: 'Subscribe to a program' })
  @ApiResponse({ status: 201, description: 'Successfully subscribed to program.' })
  async subscribeToProgram(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: { notificationMethod?: NotificationMethod, endpoint?: string, p256dh?: string, auth?: string },
  ) {
    const user = req.user;
    const { notificationMethod = NotificationMethod.BOTH, endpoint, p256dh, auth } = body;
    
    const subscription = await this.subscriptionService.createSubscription(user, {
      programId: Number(id),
      notificationMethod,
      endpoint: endpoint || '',
      p256dh: p256dh || '',
      auth: auth || '',
    });
    
    return {
      message: 'Successfully subscribed to program',
      subscription: {
        id: subscription.id,
        programId: subscription.program.id,
        notificationMethod: subscription.notificationMethod,
        createdAt: subscription.createdAt,
      },
    };
  }

  @Delete(':id/subscribe')
  @ApiOperation({ summary: 'Unsubscribe from a program' })
  @ApiResponse({ status: 200, description: 'Successfully unsubscribed from program.' })
  async unsubscribeFromProgram(
    @Request() req: any,
    @Param('id') id: string,
  ) {
    const user = req.user;

    // Validate user.id
    if (!user || !user.id || isNaN(Number(user.id))) {
      throw new UnauthorizedException('Invalid or missing user ID');
    }
    const userId = Number(user.id);

    // Find the subscription first
    const subscriptions = await this.subscriptionService.getUserSubscriptions(userId);
    const subscription = subscriptions.find(sub => sub.program.id === Number(id));

    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    await this.subscriptionService.removeSubscription(userId, subscription.id);

    return {
      message: 'Successfully unsubscribed from program',
    };
  }

  @Get(':id/panelists')
  @ApiOperation({ summary: 'Get panelists of a program' })
  @ApiResponse({ status: 200, description: 'Return the program panelists.' })
  @ApiResponse({ status: 404, description: 'Program not found.' })
  async getProgramPanelists(@Param('id') id: string): Promise<Panelist[]> {
    const program = await this.programsService.findOne(Number(id));
    if (!program) {
      throw new NotFoundException(`Program with ID ${id} not found`);
    }
    return program.panelists;
  }

  @Post(':id/panelists/:panelistId')
  @ApiOperation({ summary: 'Add panelist to a program' })
  @ApiResponse({ status: 200, description: 'Panelist added to program.' })
  @ApiResponse({ status: 404, description: 'Program or panelist not found.' })
  async addPanelist(
    @Param('id') id: string,
    @Param('panelistId') panelistId: string,
  ): Promise<void> {
    await this.programsService.addPanelist(Number(id), Number(panelistId));
  }

  @Delete(':id/panelists/:panelistId')
  @ApiOperation({ summary: 'Remove panelist from a program' })
  @ApiResponse({ status: 200, description: 'Panelist removed from program.' })
  @ApiResponse({ status: 404, description: 'Program or panelist not found.' })
  async removePanelist(
    @Param('id') id: string,
    @Param('panelistId') panelistId: string,
  ): Promise<void> {
    await this.programsService.removePanelist(Number(id), Number(panelistId));
  }

  @Post()
  @ApiOperation({ summary: 'Create a new program' })
  @ApiResponse({ status: 201, description: 'The program has been successfully created.' })
  create(@Body() createProgramDto: CreateProgramDto): Promise<Program> {
    return this.programsService.create(createProgramDto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a program' })
  @ApiResponse({ status: 200, description: 'The program has been successfully updated.' })
  @ApiResponse({ status: 404, description: 'Program not found.' })
  update(@Param('id') id: string, @Body() updateProgramDto: UpdateProgramDto): Promise<Program> {
    return this.programsService.update(Number(id), updateProgramDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a program' })
  @ApiResponse({ status: 200, description: 'The program has been successfully deleted.' })
  @ApiResponse({ status: 404, description: 'Program not found.' })
  remove(@Param('id') id: string): Promise<void> {
    return this.programsService.remove(Number(id));
  }
}