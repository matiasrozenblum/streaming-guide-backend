import { Controller, Post } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Channel } from './channels/channels.entity';
import { Program } from './programs/programs.entity';
import { Schedule } from './schedules/schedules.entity';

@Controller()
export class AppController {
  constructor(
    @InjectRepository(Channel)
    private readonly channelsRepository: Repository<Channel>,
    @InjectRepository(Program)
    private readonly programsRepository: Repository<Program>,
    @InjectRepository(Schedule)
    private readonly schedulesRepository: Repository<Schedule>,
  ) {}

  @Post('seed')
  async seed() {
    await this.programsRepository.delete({});
    await this.channelsRepository.delete({});
    await this.schedulesRepository.delete({});

    const channels = await this.channelsRepository.save([
      {
        name: 'Luzu TV',
        description: 'Canal de streaming de Luzu',
        logo_url: 'https://upload.wikimedia.org/wikipedia/commons/4/4f/Luzu_TV_logo.png',
      },
      {
        name: 'Olga',
        description: 'Canal de streaming de Olga',
        logo_url: 'https://yt3.googleusercontent.com/OlgaLogo.jpg',
      },
    ]);

    const programs = await this.programsRepository.save([
      {
        name: 'Nadie Dice Nada',
        description: 'Conducción de Nico Occhiato',
        start_time: '08:00',
        end_time: '10:00',
        channel: channels[0],
      },
      {
        name: 'Antes Que Nadie',
        description: 'Conducción de Diego Leuco',
        start_time: '10:00',
        end_time: '12:00',
        channel: channels[0],
      },
      {
        name: 'Sería Increíble',
        description: 'Conducción de Migue Granados',
        start_time: '09:00',
        end_time: '11:00',
        channel: channels[1],
      },
      {
        name: 'Soñé Que Volaba',
        description: 'Conducción de Nati Jota',
        start_time: '11:00',
        end_time: '13:00',
        channel: channels[1],
      },
    ]);

    const schedule = await this.schedulesRepository.save([
      {
        day_of_week: 'monday',
        start_time: '08:00',
        end_time: '10:00',
        program: programs[0], // Nadie Dice Nada
      },
      {
        day_of_week: 'monday',
        start_time: '10:00',
        end_time: '12:00',
        program: programs[1], // Antes que Nadie
      },
      {
        day_of_week: 'tuesday',
        start_time: '09:00',
        end_time: '11:00',
        program: programs[2], // Sería Increíble
      },
      {
        day_of_week: 'tuesday',
        start_time: '11:00',
        end_time: '13:00',
        program: programs[3], // Soñé que Volaba
      },
    ]);

    return { success: true, channels, programs, schedule };
  }
}