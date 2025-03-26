import { Controller, Post } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Channel } from './channels/channels.entity';
import { Program } from './programs/programs.entity';

@Controller()
export class AppController {
  constructor(
    @InjectRepository(Channel)
    private readonly channelsRepository: Repository<Channel>,
    @InjectRepository(Program)
    private readonly programsRepository: Repository<Program>,
  ) {}

  @Post('seed')
  async seed() {
    await this.programsRepository.delete({});
    await this.channelsRepository.delete({});

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

    return { success: true, channels, programs };
  }
}