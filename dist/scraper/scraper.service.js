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
exports.ScraperService = void 0;
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const channels_entity_1 = require("../channels/channels.entity");
const programs_entity_1 = require("../programs/programs.entity");
const schedules_entity_1 = require("../schedules/schedules.entity");
const vorterix_scraper_1 = require("./vorterix.scraper");
const common_1 = require("@nestjs/common");
let ScraperService = class ScraperService {
    channelRepo;
    programRepo;
    scheduleRepo;
    constructor(channelRepo, programRepo, scheduleRepo) {
        this.channelRepo = channelRepo;
        this.programRepo = programRepo;
        this.scheduleRepo = scheduleRepo;
    }
    async insertVorterixSchedule() {
        const data = await (0, vorterix_scraper_1.scrapeVorterixSchedule)();
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
                    logo_url: null,
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
};
exports.ScraperService = ScraperService;
exports.ScraperService = ScraperService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(channels_entity_1.Channel)),
    __param(1, (0, typeorm_1.InjectRepository)(programs_entity_1.Program)),
    __param(2, (0, typeorm_1.InjectRepository)(schedules_entity_1.Schedule)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository])
], ScraperService);
//# sourceMappingURL=scraper.service.js.map