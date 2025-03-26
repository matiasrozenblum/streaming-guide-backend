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
Object.defineProperty(exports, "__esModule", { value: true });
exports.Schedule = void 0;
const typeorm_1 = require("typeorm");
const programs_entity_1 = require("../programs/programs.entity");
let Schedule = class Schedule {
    id;
    day_of_week;
    start_time;
    end_time;
    program;
};
exports.Schedule = Schedule;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)(),
    __metadata("design:type", Number)
], Schedule.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], Schedule.prototype, "day_of_week", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'time' }),
    __metadata("design:type", String)
], Schedule.prototype, "start_time", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'time' }),
    __metadata("design:type", String)
], Schedule.prototype, "end_time", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => programs_entity_1.Program, (program) => program.schedules),
    __metadata("design:type", programs_entity_1.Program)
], Schedule.prototype, "program", void 0);
exports.Schedule = Schedule = __decorate([
    (0, typeorm_1.Entity)()
], Schedule);
//# sourceMappingURL=schedules.entity.js.map