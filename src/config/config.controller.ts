import { Controller, Get, Post, Body, Param, Patch, Delete } from '@nestjs/common';
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

  @Patch(':key')
  async update(@Param('key') key: string, @Body() body: { value: string }) {
    return this.configService.set(key, body.value);
  }

  @Delete(':key')
  async remove(@Param('key') key: string) {
    return this.configService.remove(key);
  }
}