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
exports.PanelistsController = void 0;
const common_1 = require("@nestjs/common");
const panelists_service_1 = require("./panelists.service");
const create_panelist_dto_1 = require("./dto/create-panelist.dto");
const panelists_entity_1 = require("./panelists.entity");
const swagger_1 = require("@nestjs/swagger");
let PanelistsController = class PanelistsController {
    panelistsService;
    constructor(panelistsService) {
        this.panelistsService = panelistsService;
    }
    findAll() {
        return this.panelistsService.findAll();
    }
    findOne(id) {
        return this.panelistsService.findOne(id);
    }
    create(createPanelistDto) {
        return this.panelistsService.create(createPanelistDto);
    }
    remove(id) {
        return this.panelistsService.remove(id);
    }
};
exports.PanelistsController = PanelistsController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Obtener todos los panelistas' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Lista de panelistas', type: [panelists_entity_1.Panelist] }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], PanelistsController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Obtener un panelista por ID' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Panelista encontrado', type: panelists_entity_1.Panelist }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], PanelistsController.prototype, "findOne", null);
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: 'Crear un nuevo panelista' }),
    (0, swagger_1.ApiResponse)({ status: 201, description: 'Panelista creado', type: panelists_entity_1.Panelist }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_panelist_dto_1.CreatePanelistDto]),
    __metadata("design:returntype", Promise)
], PanelistsController.prototype, "create", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Eliminar un panelista por ID' }),
    (0, swagger_1.ApiResponse)({ status: 204, description: 'Panelista eliminado' }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], PanelistsController.prototype, "remove", null);
exports.PanelistsController = PanelistsController = __decorate([
    (0, swagger_1.ApiTags)('panelists'),
    (0, common_1.Controller)('panelists'),
    __metadata("design:paramtypes", [panelists_service_1.PanelistsService])
], PanelistsController);
//# sourceMappingURL=panelists.controller.js.map