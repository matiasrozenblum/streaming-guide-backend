import { Controller, Post } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Channel } from './channels/channels.entity';
import { Program } from './programs/programs.entity';
import { Schedule } from './schedules/schedules.entity';
import { Panelist } from './panelists/panelists.entity';

@Controller()
export class AppController {
  constructor(
    @InjectRepository(Channel)
    private readonly channelsRepository: Repository<Channel>,
    @InjectRepository(Program)
    private readonly programsRepository: Repository<Program>,
    @InjectRepository(Schedule)
    private readonly schedulesRepository: Repository<Schedule>,
    @InjectRepository(Panelist)
    private readonly panelistsRepository: Repository<Panelist>,
    private readonly dataSource: DataSource,
  ) {}

  @Post('seed')
async seed() {
  await this.dataSource.query('DELETE FROM "program_panelists_panelist"');
  await this.panelistsRepository.delete({});
  await this.schedulesRepository.delete({});
  await this.programsRepository.delete({});
  await this.channelsRepository.delete({});

  const luzu = await this.channelsRepository.save({
    name: 'Luzu TV',
    description: 'Canal de streaming de Luzu',
    logo_url: 'https://upload.wikimedia.org/wikipedia/commons/4/4f/Luzu_TV_logo.png',
  });

  const programs = await this.programsRepository.save([
    { name: 'Se Fue Larga', description: '', start_time: '14:30', end_time: '16:30', channel: luzu },
    { name: 'La Novela', description: '', start_time: '16:30', end_time: '18:30', channel: luzu },
    { name: 'FM Luzu', description: '', start_time: '07:00', end_time: '08:00', channel: luzu },
    { name: 'Patria y Familia', description: '', start_time: '12:30', end_time: '14:30', channel: luzu },
    { name: 'Algo Va a Picar', description: '', start_time: '16:30', end_time: '18:30', channel: luzu },
    { name: 'Antes Que Nadie', description: '', start_time: '08:00', end_time: '10:00', channel: luzu },
    { name: 'Nadie Dice Nada', description: '', start_time: '10:00', end_time: '12:30', channel: luzu },
  ]);

  const find = (name: string) => programs.find(p => p.name === name)!;

  await this.schedulesRepository.save([
    // FM Luzu: Lun-Vie
    ...['monday', 'tuesday', 'wednesday', 'thursday', 'friday'].map(day => ({
      day_of_week: day,
      start_time: '07:00',
      end_time: '08:00',
      program: find('FM Luzu'),
      logo_url: 'https://luzutv.com.ar/wp-content/uploads/2025/01/card-ndn-hover.jpg',
    })),

    // Antes Que Nadie: Lun-Vie
    ...['monday', 'tuesday', 'wednesday', 'thursday', 'friday'].map(day => ({
      day_of_week: day,
      start_time: '08:00',
      end_time: '10:00',
      program: find('Antes Que Nadie'),
      logo_url: 'https://luzutv.com.ar/wp-content/uploads/2025/01/card-aqn-hover.jpg',
    })),

    // Nadie Dice Nada: Lun-Vie
    ...['monday', 'tuesday', 'wednesday', 'thursday', 'friday'].map(day => ({
      day_of_week: day,
      start_time: '10:00',
      end_time: '12:30',
      program: find('Nadie Dice Nada'),
      logo_url: 'https://luzutv.com.ar/wp-content/uploads/2025/01/card-ndn-hover.jpg',
    })),

    // Patria y Familia: Lun-Vie
    ...['monday', 'tuesday', 'wednesday', 'thursday', 'friday'].map(day => ({
      day_of_week: day,
      start_time: '12:30',
      end_time: '14:30',
      program: find('Patria y Familia'),
      logo_url: 'https://luzutv.com.ar/wp-content/uploads/2025/01/card-pyf-hover.jpg',
    })),

    // Se Fue Larga: Lun-Vie
    ...['monday', 'tuesday', 'wednesday', 'thursday', 'friday'].map(day => ({
      day_of_week: day,
      start_time: '14:30',
      end_time: '16:30',
      program: find('Se Fue Larga'),
      logo_url: 'https://luzutv.com.ar/wp-content/uploads/2025/01/card-ndn-hover.jpg',
    })),

    // La Novela: Lun, Mié, Vie
    ...['monday', 'wednesday', 'friday'].map(day => ({
      day_of_week: day,
      start_time: '16:30',
      end_time: '18:30',
      program: find('La Novela'),
      logo_url: 'https://luzutv.com.ar/wp-content/uploads/2025/01/card-ln-hover.jpg',
    })),

    // Algo Va a Picar: Mar y Jue
    ...['tuesday', 'thursday'].map(day => ({
      day_of_week: day,
      start_time: '16:30',
      end_time: '18:30',
      program: find('Algo Va a Picar'),
      logo_url: 'https://luzutv.com.ar/wp-content/uploads/2025/01/card-ndn-hover.jpg',
    })),
  ]);

  return { success: true };
}
}