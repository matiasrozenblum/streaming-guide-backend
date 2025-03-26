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
exports.SchedulesController = void 0;
const common_1 = require("@nestjs/common");
const schedules_service_1 = require("./schedules.service");
const create_schedule_dto_1 = require("./dto/create-schedule.dto");
const schedules_entity_1 = require("./schedules.entity");
const swagger_1 = require("@nestjs/swagger");
let SchedulesController = class SchedulesController {
    schedulesService;
    constructor(schedulesService) {
        this.schedulesService = schedulesService;
    }
    findAll() {
        return this.schedulesService.findAll();
    }
    findOne(id) {
        return this.schedulesService.findOne(id);
    }
    create(createScheduleDto) {
        return this.schedulesService.create(createScheduleDto);
    }
    remove(id) {
        return this.schedulesService.remove(id);
    }
};
exports.SchedulesController = SchedulesController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Obtener todos los horarios' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Lista de horarios', type: [schedules_entity_1.Schedule] }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], SchedulesController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Obtener un horario por ID' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Horario encontrado', type: schedules_entity_1.Schedule }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], SchedulesController.prototype, "findOne", null);
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: 'Crear un nuevo horario' }),
    (0, swagger_1.ApiResponse)({ status: 201, description: 'Horario creado', type: schedules_entity_1.Schedule }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_schedule_dto_1.CreateScheduleDto]),
    __metadata("design:returntype", Promise)
], SchedulesController.prototype, "create", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Eliminar un horario por ID' }),
    (0, swagger_1.ApiResponse)({ status: 204, description: 'Horario eliminado' }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], SchedulesController.prototype, "remove", null);
exports.SchedulesController = SchedulesController = __decorate([
    (0, swagger_1.ApiTags)('schedules'),
    (0, common_1.Controller)('schedules'),
    __metadata("design:paramtypes", [schedules_service_1.SchedulesService])
], SchedulesController);
//# sourceMappingURL=schedules.controller.js.map