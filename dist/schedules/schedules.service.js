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
exports.SchedulesService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const schedules_entity_1 = require("./schedules.entity");
const programs_entity_1 = require("../programs/programs.entity");
let SchedulesService = class SchedulesService {
    schedulesRepository;
    programsRepository;
    constructor(schedulesRepository, programsRepository) {
        this.schedulesRepository = schedulesRepository;
        this.programsRepository = programsRepository;
    }
    async findAll() {
        return this.schedulesRepository.find({
            relations: ['program', 'program.channel', 'program.panelists'],
        });
    }
    async findOne(id) {
        const channel = await this.schedulesRepository.findOne({ where: { id } });
        if (!channel) {
            throw new common_1.NotFoundException(`Channel with ID ${id} not found`);
        }
        return channel;
    }
    async create(createScheduleDto) {
        const program = await this.programsRepository.findOne({
            where: { id: parseInt(createScheduleDto.programId, 10) },
        });
        if (!program) {
            throw new common_1.NotFoundException(`Program with ID ${createScheduleDto.programId} not found`);
        }
        const schedule = this.schedulesRepository.create({
            day_of_week: createScheduleDto.dayOfWeek,
            start_time: createScheduleDto.startTime,
            end_time: createScheduleDto.endTime,
            program,
        });
        return this.schedulesRepository.save(schedule);
    }
    remove(id) {
        return this.schedulesRepository.delete(id).then(() => { });
    }
};
exports.SchedulesService = SchedulesService;
exports.SchedulesService = SchedulesService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(schedules_entity_1.Schedule)),
    __param(1, (0, typeorm_1.InjectRepository)(programs_entity_1.Program)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository])
], SchedulesService);
//# sourceMappingURL=schedules.service.js.map