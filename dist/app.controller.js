"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppController = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const channels_entity_1 = require("./channels/channels.entity");
const programs_entity_1 = require("./programs/programs.entity");
const schedules_entity_1 = require("./schedules/schedules.entity");
const panelists_entity_1 = require("./panelists/panelists.entity");
let AppController = class AppController {
    channelsRepository;
    programsRepository;
    schedulesRepository;
    panelistsRepository;
    dataSource;
    constructor(channelsRepository, programsRepository, schedulesRepository, panelistsRepository, dataSource) {
        this.channelsRepository = channelsRepository;
        this.programsRepository = programsRepository;
        this.schedulesRepository = schedulesRepository;
        this.panelistsRepository = panelistsRepository;
        this.dataSource = dataSource;
    }
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
            const olgaPrograms = await Promise.all(Object.entries(panelistsMap).map(async ([name, panelistNames]) => {
                const panelists = await this.panelistsRepository.save(panelistNames.map((name) => ({ name })));
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
            }));
            const findOlga = (name) => olgaPrograms.find(p => p.name === name);
            await this.schedulesRepository.save([
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
                ...['monday', 'wednesday'].map(day => ({
                    day_of_week: day,
                    start_time: '16:00',
                    end_time: '18:00',
                    program: findOlga('TDT'),
                })),
                {
                    day_of_week: 'thursday',
                    start_time: '16:00',
                    end_time: '18:00',
                    program: findOlga('Mi Primo es Así'),
                },
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
};
exports.AppController = AppController;
__decorate([
    (0, common_1.Post)('seed'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AppController.prototype, "seed", null);
exports.AppController = AppController = __decorate([
    (0, common_1.Controller)(),
    __param(0, (0, typeorm_1.InjectRepository)(channels_entity_1.Channel)),
    __param(1, (0, typeorm_1.InjectRepository)(programs_entity_1.Program)),
    __param(2, (0, typeorm_1.InjectRepository)(schedules_entity_1.Schedule)),
    __param(3, (0, typeorm_1.InjectRepository)(panelists_entity_1.Panelist)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.DataSource])
], AppController);
//# sourceMappingURL=app.controller.js.map