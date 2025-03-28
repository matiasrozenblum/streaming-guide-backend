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
        const find = (name) => programs.find(p => p.name === name);
        await this.schedulesRepository.save([
            ...['monday', 'tuesday', 'wednesday', 'thursday', 'friday'].map(day => ({
                day_of_week: day,
                start_time: '07:00',
                end_time: '08:00',
                program: find('FM Luzu'),
                logo_url: 'https://luzutv.com.ar/wp-content/uploads/2025/01/card-ndn-hover.jpg',
            })),
            ...['monday', 'tuesday', 'wednesday', 'thursday', 'friday'].map(day => ({
                day_of_week: day,
                start_time: '08:00',
                end_time: '10:00',
                program: find('Antes Que Nadie'),
                logo_url: 'https://luzutv.com.ar/wp-content/uploads/2025/01/card-aqn-hover.jpg',
            })),
            ...['monday', 'tuesday', 'wednesday', 'thursday', 'friday'].map(day => ({
                day_of_week: day,
                start_time: '10:00',
                end_time: '12:30',
                program: find('Nadie Dice Nada'),
                logo_url: 'https://luzutv.com.ar/wp-content/uploads/2025/01/card-ndn-hover.jpg',
            })),
            ...['monday', 'tuesday', 'wednesday', 'thursday', 'friday'].map(day => ({
                day_of_week: day,
                start_time: '12:30',
                end_time: '14:30',
                program: find('Patria y Familia'),
                logo_url: 'https://luzutv.com.ar/wp-content/uploads/2025/01/card-pyf-hover.jpg',
            })),
            ...['monday', 'tuesday', 'wednesday', 'thursday', 'friday'].map(day => ({
                day_of_week: day,
                start_time: '14:30',
                end_time: '16:30',
                program: find('Se Fue Larga'),
                logo_url: 'https://luzutv.com.ar/wp-content/uploads/2025/01/card-ndn-hover.jpg',
            })),
            ...['monday', 'wednesday', 'friday'].map(day => ({
                day_of_week: day,
                start_time: '16:30',
                end_time: '18:30',
                program: find('La Novela'),
                logo_url: 'https://luzutv.com.ar/wp-content/uploads/2025/01/card-ln-hover.jpg',
            })),
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