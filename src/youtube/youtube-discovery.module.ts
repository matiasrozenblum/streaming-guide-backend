import { Module } from '@nestjs/common';
import { YoutubeDiscoveryService } from './youtube-discovery.service';

@Module({
  providers: [YoutubeDiscoveryService],
  exports: [YoutubeDiscoveryService],
})
export class YoutubeDiscoveryModule {} 