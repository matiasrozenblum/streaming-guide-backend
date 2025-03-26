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
    constructor(channelsRepository, programsRepository, schedulesRepository, panelistsRepository) {
        this.channelsRepository = channelsRepository;
        this.programsRepository = programsRepository;
        this.schedulesRepository = schedulesRepository;
        this.panelistsRepository = panelistsRepository;
    }
    async seed() {
        await this.panelistsRepository.delete({});
        await this.schedulesRepository.delete({});
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
        await this.panelistsRepository.save([
            {
                name: 'Nico Occhiato',
                programs: [programs[0]],
            },
            {
                name: 'Flor Jazmín Peña',
                programs: [programs[0]],
            },
            {
                name: 'Diego Leuco',
                programs: [programs[1]],
            },
            {
                name: 'Cande Molfese',
                programs: [programs[1]],
            },
            {
                name: 'Migue Granados',
                programs: [programs[2]],
            },
            {
                name: 'Nati Jota',
                programs: [programs[3]],
            },
        ]);
        const schedule = await this.schedulesRepository.save([
            {
                day_of_week: 'monday',
                start_time: '08:00',
                end_time: '10:00',
                program: programs[0],
            },
            {
                day_of_week: 'monday',
                start_time: '10:00',
                end_time: '12:00',
                program: programs[1],
            },
            {
                day_of_week: 'tuesday',
                start_time: '09:00',
                end_time: '11:00',
                program: programs[2],
            },
            {
                day_of_week: 'tuesday',
                start_time: '11:00',
                end_time: '13:00',
                program: programs[3],
            },
        ]);
        return { success: true, channels, programs, schedule };
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
        typeorm_2.Repository])
], AppController);
//# sourceMappingURL=app.controller.js.map