import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Channel } from '../channels/channels.entity';
import { Program } from '../programs/programs.entity';
import { Schedule } from '../schedules/schedules.entity';
import { VorterixProgram, scrapeVorterixSchedule } from './vorterix.scraper';
import { Injectable } from '@nestjs/common';

@Injectable()
export class ScraperService {
  constructor(
    @InjectRepository(Channel)
    private readonly channelRepo: Repository<Channel>,
    @InjectRepository(Program)
    private readonly programRepo: Repository<Program>,
    @InjectRepository(Schedule)
    private readonly scheduleRepo: Repository<Schedule>,
  ) {}

  async insertVorterixSchedule() {
    const data: VorterixProgram[] = await scrapeVorterixSchedule();

    const channelName = 'Vorterix';

    let channel = await this.channelRepo.findOne({ where: { name: channelName } });

    if (!channel) {
      channel = this.channelRepo.create({ name: channelName });
      await this.channelRepo.save(channel);
    }

    for (const item of data) {
      let program = await this.programRepo.findOne({ where: { name: item.name, channel: { id: channel.id } }, relations: ['channel'] });

      if (!program) {
        program = this.programRepo.create({
          name: item.name,
          channel,
          logo_url: null, // si en algún momento tenés logos, podés setearlo acá
        });
        await this.programRepo.save(program);
      }

      for (const day of item.days) {
        const existingSchedule = await this.scheduleRepo.findOne({
          where: {
            program: { id: program.id },
            day_of_week: day,
          },
          relations: ['program'],
        });

        if (!existingSchedule) {
          await this.scheduleRepo.save({
            program,
            day_of_week: day.toLowerCase(),
            start_time: item.startTime,
            end_time: item.endTime,
          });
        }
      }
    }

    return { success: true };
  }
}