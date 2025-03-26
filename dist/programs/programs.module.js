"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProgramsModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const programs_controller_1 = require("./programs.controller");
const programs_service_1 = require("./programs.service");
const programs_entity_1 = require("./programs.entity");
let ProgramsModule = class ProgramsModule {
};
exports.ProgramsModule = ProgramsModule;
exports.ProgramsModule = ProgramsModule = __decorate([
    (0, common_1.Module)({
        imports: [typeorm_1.TypeOrmModule.forFeature([programs_entity_1.Program])],
        controllers: [programs_controller_1.ProgramsController],
        providers: [programs_service_1.ProgramsService],
    })
], ProgramsModule);
//# sourceMappingURL=programs.module.js.map