import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { ConfigService } from './config.service';

@Controller('config')
export class ConfigController {
  constructor(private readonly configService: ConfigService) {}

  @Get()
  findAll() {
    return this.configService.findAll();
  }

  @Get(':key')
  async get(@Param('key') key: string) {
    return this.configService.get(key);
  }

  @Post()
  async set(@Body() body: { key: string; value: string }) {
    return this.configService.set(body.key, body.value);
  }
}