import { Controller, Post, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TokenRefreshService } from './token-refresh.service';

@ApiTags('tokens')
@Controller('tokens')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class TokenRefreshController {
  constructor(private readonly tokenRefreshService: TokenRefreshService) {}

  @Post('refresh/twitch')
  @ApiOperation({ 
    summary: 'Manually refresh Twitch app access token',
    description: 'Forces a refresh of the Twitch app access token. Useful for testing or when tokens expire.',
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Token refresh result',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        tokenPreview: { type: 'string', description: 'First 20 characters of the new token' },
      },
    },
  })
  async refreshTwitchToken(): Promise<{ success: boolean; message: string; tokenPreview?: string }> {
    const success = await this.tokenRefreshService.refreshTwitchToken();
    
    if (success) {
      const token = await this.tokenRefreshService.getTwitchAccessToken();
      return {
        success: true,
        message: 'Twitch token refreshed successfully',
        tokenPreview: token ? `${token.substring(0, 20)}...` : undefined,
      };
    }
    
    return {
      success: false,
      message: 'Failed to refresh Twitch token. Check logs for details.',
    };
  }

  @Post('refresh/kick')
  @ApiOperation({ 
    summary: 'Manually refresh Kick app access token',
    description: 'Forces a refresh of the Kick app access token. Useful for testing or when tokens expire.',
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Token refresh result',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        tokenPreview: { type: 'string', description: 'First 20 characters of the new token' },
      },
    },
  })
  async refreshKickToken(): Promise<{ success: boolean; message: string; tokenPreview?: string }> {
    const success = await this.tokenRefreshService.refreshKickToken();
    
    if (success) {
      const token = await this.tokenRefreshService.getKickAccessToken();
      return {
        success: true,
        message: 'Kick token refreshed successfully',
        tokenPreview: token ? `${token.substring(0, 20)}...` : undefined,
      };
    }
    
    return {
      success: false,
      message: 'Failed to refresh Kick token. Check logs for details.',
    };
  }

  @Post('refresh/all')
  @ApiOperation({ 
    summary: 'Manually refresh all tokens (Twitch and Kick)',
    description: 'Forces a refresh of both Twitch and Kick app access tokens. Useful for testing or when tokens expire.',
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Token refresh results for both services',
    schema: {
      type: 'object',
      properties: {
        twitch: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
          },
        },
        kick: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
          },
        },
      },
    },
  })
  async refreshAllTokens(): Promise<{
    twitch: { success: boolean; message: string };
    kick: { success: boolean; message: string };
  }> {
    const [twitchSuccess, kickSuccess] = await Promise.all([
      this.tokenRefreshService.refreshTwitchToken(),
      this.tokenRefreshService.refreshKickToken(),
    ]);

    return {
      twitch: {
        success: twitchSuccess,
        message: twitchSuccess 
          ? 'Twitch token refreshed successfully' 
          : 'Failed to refresh Twitch token. Check logs for details.',
      },
      kick: {
        success: kickSuccess,
        message: kickSuccess 
          ? 'Kick token refreshed successfully' 
          : 'Failed to refresh Kick token. Check logs for details.',
      },
    };
  }

  @Post('refresh')
  @ApiOperation({ 
    summary: 'Check and refresh tokens if needed',
    description: 'Checks token expiration status and refreshes tokens that are 50+ days old. This is the same logic used by the daily scheduler.',
  })
  @ApiQuery({ 
    name: 'force', 
    required: false, 
    type: Boolean,
    description: 'If true, forces refresh even if tokens are not yet 50 days old',
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Token check and refresh results',
    schema: {
      type: 'object',
      properties: {
        twitch: {
          type: 'object',
          properties: {
            refreshed: { type: 'boolean' },
            message: { type: 'string' },
            daysUntilExpiry: { type: 'number', nullable: true },
          },
        },
        kick: {
          type: 'object',
          properties: {
            refreshed: { type: 'boolean' },
            message: { type: 'string' },
            daysUntilExpiry: { type: 'number', nullable: true },
          },
        },
      },
    },
  })
  async checkAndRefreshTokens(
    @Query('force') force?: string,
  ): Promise<{
    twitch: { refreshed: boolean; message: string; daysUntilExpiry?: number };
    kick: { refreshed: boolean; message: string; daysUntilExpiry?: number };
  }> {
    if (force === 'true') {
      // Force refresh both tokens
      const [twitchSuccess, kickSuccess] = await Promise.all([
        this.tokenRefreshService.refreshTwitchToken(),
        this.tokenRefreshService.refreshKickToken(),
      ]);

      return {
        twitch: {
          refreshed: twitchSuccess,
          message: twitchSuccess ? 'Twitch token refreshed' : 'Failed to refresh Twitch token',
        },
        kick: {
          refreshed: kickSuccess,
          message: kickSuccess ? 'Kick token refreshed' : 'Failed to refresh Kick token',
        },
      };
    }

    // Use the normal check and refresh logic
    await this.tokenRefreshService.checkAndRefreshTokens();

    // Get token status
    const twitchToken = await this.tokenRefreshService.getTwitchAccessToken();
    const kickToken = await this.tokenRefreshService.getKickAccessToken();

    return {
      twitch: {
        refreshed: !!twitchToken,
        message: twitchToken ? 'Twitch token is valid' : 'No Twitch token available',
      },
      kick: {
        refreshed: !!kickToken,
        message: kickToken ? 'Kick token is valid' : 'No Kick token available',
      },
    };
  }

  @Get('status')
  @ApiOperation({ 
    summary: 'Get current token status',
    description: 'Returns the current status of Twitch and Kick tokens, including expiration information.',
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Token status information',
    schema: {
      type: 'object',
      properties: {
        twitch: {
          type: 'object',
          properties: {
            hasToken: { type: 'boolean' },
            tokenPreview: { type: 'string', nullable: true },
            expiresAt: { type: 'string', nullable: true },
            daysUntilExpiry: { type: 'number', nullable: true },
            ageInDays: { type: 'number', nullable: true },
          },
        },
        kick: {
          type: 'object',
          properties: {
            hasToken: { type: 'boolean' },
            tokenPreview: { type: 'string', nullable: true },
            expiresAt: { type: 'string', nullable: true },
            daysUntilExpiry: { type: 'number', nullable: true },
            ageInDays: { type: 'number', nullable: true },
          },
        },
      },
    },
  })
  async getTokenStatus(): Promise<{
    twitch: {
      hasToken: boolean;
      tokenPreview?: string;
      expiresAt?: string;
      daysUntilExpiry?: number;
      ageInDays?: number;
    };
    kick: {
      hasToken: boolean;
      tokenPreview?: string;
      expiresAt?: string;
      daysUntilExpiry?: number;
      ageInDays?: number;
    };
  }> {
    const [twitchStatus, kickStatus] = await Promise.all([
      this.tokenRefreshService.getTwitchTokenStatus(),
      this.tokenRefreshService.getKickTokenStatus(),
    ]);

    return {
      twitch: twitchStatus,
      kick: kickStatus,
    };
  }
}

