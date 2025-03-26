"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PanelistsModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const panelists_controller_1 = require("./panelists.controller");
const panelists_service_1 = require("./panelists.service");
const panelists_entity_1 = require("./panelists.entity");
let PanelistsModule = class PanelistsModule {
};
exports.PanelistsModule = PanelistsModule;
exports.PanelistsModule = PanelistsModule = __decorate([
    (0, common_1.Module)({
        imports: [typeorm_1.TypeOrmModule.forFeature([panelists_entity_1.Panelist])],
        controllers: [panelists_controller_1.PanelistsController],
        providers: [panelists_service_1.PanelistsService],
    })
], PanelistsModule);
//# sourceMappingURL=panelists.module.js.map