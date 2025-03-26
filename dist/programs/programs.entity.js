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
exports.Program = void 0;
const typeorm_1 = require("typeorm");
const channels_entity_1 = require("../channels/channels.entity");
const schedules_entity_1 = require("../schedules/schedules.entity");
const panelists_entity_1 = require("../panelists/panelists.entity");
let Program = class Program {
    id;
    name;
    description;
    start_time;
    end_time;
    channel;
    schedules;
    panelists;
};
exports.Program = Program;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)(),
    __metadata("design:type", Number)
], Program.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], Program.prototype, "name", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true }),
    __metadata("design:type", String)
], Program.prototype, "description", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'time', nullable: true }),
    __metadata("design:type", String)
], Program.prototype, "start_time", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'time', nullable: true }),
    __metadata("design:type", String)
], Program.prototype, "end_time", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => channels_entity_1.Channel, (channel) => channel.programs),
    __metadata("design:type", channels_entity_1.Channel)
], Program.prototype, "channel", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => schedules_entity_1.Schedule, (schedule) => schedule.program),
    __metadata("design:type", Array)
], Program.prototype, "schedules", void 0);
__decorate([
    (0, typeorm_1.ManyToMany)(() => panelists_entity_1.Panelist, (panelist) => panelist.programs),
    (0, typeorm_1.JoinTable)(),
    __metadata("design:type", Array)
], Program.prototype, "panelists", void 0);
exports.Program = Program = __decorate([
    (0, typeorm_1.Entity)()
], Program);
//# sourceMappingURL=programs.entity.js.map