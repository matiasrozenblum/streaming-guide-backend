import { Module } from '@nestjs/common';
import { BetterStackService } from './betterstack.service';

@Module({
  providers: [BetterStackService],
  exports: [BetterStackService],
})
export class BetterStackModule {}
