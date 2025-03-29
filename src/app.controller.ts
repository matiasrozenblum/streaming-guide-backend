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
    const existingOlga = await this.channelsRepository.findOne({ where: { name: 'Olga' } });
    if (!existingOlga) {
      const olga = await this.channelsRepository.save({
        name: 'Olga',
        description: 'Canal de streaming Olga',
        logo_url: null,
      });
  
      const panelistsMap = {
        'Paraíso Fiscal': ['Fer Dente', 'Luciana Geuna', 'Martín Reich', 'Tania Wed'],
        'Sería Increíble': ['Nati Jota', 'Damián Betular', 'Homero Pettinato', 'Eial Moldavsky'],
        'Soñé que Volaba': ['Migue Granados', 'Marti Benza', 'Lucas Fridman', 'Evitta Luna', 'Benja Amadeo'],
        'El Fin del Mundo': ['Lizy Tagliani', 'Toto Kirzner', 'Cami Jara'],
        'Tapados de Laburo': ['Nachito Elizalde', 'Paula Chaves', 'Luli González', 'Evelyn Botto', 'Mortedor'],
        'TDT': ['Marti Benza', 'Cami Jara', 'Gian Odoguari', 'Nico Ferrero'],
        'Mi Primo es Así': ['Martín Rechimuzzi', 'Toto Kirzner', 'Evelyn Botto', 'Noe Custodio'],
        'Gol Gana': ['Gastón Edul', 'Pollo Álvarez', 'Ariel Senosiain', 'Pedro Alfonso', 'Coker'],
      };
  
      const olgaPrograms = await Promise.all(
        Object.entries(panelistsMap).map(async ([name, panelistNames]) => {
          const panelists = await this.panelistsRepository.save(
            panelistNames.map((name) => ({ name }))
          );
          const [start_time, end_time] = (() => {
            switch (name) {
              case 'Paraíso Fiscal': return ['06:00', '08:00'];
              case 'Sería Increíble': return ['08:00', '10:00'];
              case 'Soñé que Volaba': return ['10:00', '12:00'];
              case 'El Fin del Mundo': return ['12:00', '14:00'];
              case 'Tapados de Laburo': return ['14:00', '16:00'];
              case 'TDT': return ['16:00', '18:00'];
              case 'Mi Primo es Así': return ['16:00', '18:00'];
              case 'Gol Gana': return ['18:00', '20:00'];
              default: return ['00:00', '00:00'];
            }
          })();
          return this.programsRepository.save({
            name,
            description: '',
            start_time,
            end_time,
            channel: olga,
            panelists,
          });
        })
      );
  
      const findOlga = (name: string) => olgaPrograms.find(p => p.name === name)!;
  
      await this.schedulesRepository.save([
        // Lunes a Viernes
        ...['monday', 'tuesday', 'wednesday', 'thursday', 'friday'].flatMap(day => [
          {
            day_of_week: day,
            start_time: '06:00',
            end_time: '08:00',
            program: findOlga('Paraíso Fiscal'),
          },
          {
            day_of_week: day,
            start_time: '08:00',
            end_time: '10:00',
            program: findOlga('Sería Increíble'),
          },
          {
            day_of_week: day,
            start_time: '10:00',
            end_time: '12:00',
            program: findOlga('Soñé que Volaba'),
          },
          {
            day_of_week: day,
            start_time: '12:00',
            end_time: '14:00',
            program: findOlga('El Fin del Mundo'),
          },
          {
            day_of_week: day,
            start_time: '14:00',
            end_time: '16:00',
            program: findOlga('Tapados de Laburo'),
          },
        ]),
        // TDT: Lunes y Miércoles
        ...['monday', 'wednesday'].map(day => ({
          day_of_week: day,
          start_time: '16:00',
          end_time: '18:00',
          program: findOlga('TDT'),
        })),
        // Mi Primo es Así: Jueves
        {
          day_of_week: 'thursday',
          start_time: '16:00',
          end_time: '18:00',
          program: findOlga('Mi Primo es Así'),
        },
        // Gol Gana: Martes
        {
          day_of_week: 'tuesday',
          start_time: '18:00',
          end_time: '20:00',
          program: findOlga('Gol Gana'),
        },
      ]);
    }
  
    return { message: 'Seed completed for Blender and Olga (only if not already present).' };
}
}