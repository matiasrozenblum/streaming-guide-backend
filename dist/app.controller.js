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
        const existingChannels = await this.channelsRepository.find({
            where: [
                { name: 'Bondi Live' },
                { name: 'La Casa Streaming' },
            ],
        });
        const hasBondi = existingChannels.find(c => c.name === 'Bondi Live');
        const hasCasa = existingChannels.find(c => c.name === 'La Casa Streaming');
        if (!hasBondi) {
            const bondi = await this.channelsRepository.save({
                name: 'Bondi Live',
                description: '',
                logo_url: null,
            });
            const bondiPrograms = await Promise.all([
                {
                    name: 'Tremenda Mañana',
                    panelists: ['Esteban Trebucq', 'Carlos Strione', 'Sol Simunivic'],
                    start: '09:00',
                    end: '10:30',
                },
                {
                    name: 'El Ejército de la Mañana',
                    panelists: ['Pepe Ochoa', 'Fede Bongiorno'],
                    start: '10:30',
                    end: '12:00',
                },
                {
                    name: 'Ángel Responde',
                    panelists: ['Ángel De Brito', 'Carla Conte', 'Dalma Maradona', 'Juli Argenta'],
                    start: '12:00',
                    end: '14:00',
                },
            ].map(async ({ name, panelists, start, end }) => {
                const savedPanelists = await this.panelistsRepository.save(panelists.map(name => ({ name })));
                return this.programsRepository.save({
                    name,
                    description: '',
                    start_time: start,
                    end_time: end,
                    channel: bondi,
                    panelists: savedPanelists,
                });
            }));
            const findBondi = (name) => bondiPrograms.find(p => p.name === name);
            await this.schedulesRepository.save(['monday', 'tuesday', 'wednesday', 'thursday', 'friday'].flatMap(day => [
                {
                    day_of_week: day,
                    start_time: '09:00',
                    end_time: '10:30',
                    program: findBondi('Tremenda Mañana'),
                },
                {
                    day_of_week: day,
                    start_time: '10:30',
                    end_time: '12:00',
                    program: findBondi('El Ejército de la Mañana'),
                },
                {
                    day_of_week: day,
                    start_time: '12:00',
                    end_time: '14:00',
                    program: findBondi('Ángel Responde'),
                },
            ]));
        }
        if (!hasCasa) {
            const casa = await this.channelsRepository.save({
                name: 'La Casa Streaming',
                description: '',
                logo_url: null,
            });
            const casaPrograms = await Promise.all([
                { name: 'Tengo Capturas', panelists: [], start: '10:30', end: '12:00', days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'] },
                { name: 'Rumis', panelists: [], start: '12:00', end: '14:00', days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'] },
                { name: 'Circuito Cerrado', panelists: [], start: '14:00', end: '16:00', days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'] },
                { name: 'Corte y Queda', panelists: [], start: '16:00', end: '18:00', days: ['monday', 'wednesday', 'friday'] },
                { name: 'Falta de Límites', panelists: [], start: '16:00', end: '18:00', days: ['tuesday', 'thursday'] },
                { name: 'Al Horno con maru', panelists: [], start: '18:00', end: '18:30', days: ['monday'] },
            ].map(async ({ name, panelists, start, end, days }) => {
                const saved = await this.programsRepository.save({
                    name,
                    description: '',
                    start_time: start,
                    end_time: end,
                    channel: casa,
                    panelists: [],
                });
                return { program: saved, days };
            }));
            await this.schedulesRepository.save(casaPrograms.flatMap(({ program, days }) => days.map(day => ({
                program,
                day_of_week: day,
                start_time: program.start_time,
                end_time: program.end_time,
            }))));
        }
        return { message: 'Seed completed for Bondi Live and La Casa Streaming (only if not already present).' };
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