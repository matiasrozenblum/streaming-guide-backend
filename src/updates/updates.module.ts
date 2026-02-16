import { Module } from '@nestjs/common';
import { UpdatesController } from './updates.controller';
import { UpdatesService } from './updates.service';
import { StreamersModule } from '../streamers/streamers.module';

@Module({
    imports: [StreamersModule],
    controllers: [UpdatesController],
    providers: [UpdatesService],
})
export class UpdatesModule { }
