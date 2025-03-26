"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SchedulesModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const schedules_controller_1 = require("./schedules.controller");
const schedules_service_1 = require("./schedules.service");
const schedules_entity_1 = require("./schedules.entity");
const programs_entity_1 = require("../programs/programs.entity");
let SchedulesModule = class SchedulesModule {
};
exports.SchedulesModule = SchedulesModule;
exports.SchedulesModule = SchedulesModule = __decorate([
    (0, common_1.Module)({
        imports: [typeorm_1.TypeOrmModule.forFeature([schedules_entity_1.Schedule, programs_entity_1.Program])],
        controllers: [schedules_controller_1.SchedulesController],
        providers: [schedules_service_1.SchedulesService],
    })
], SchedulesModule);
//# sourceMappingURL=schedules.module.js.map