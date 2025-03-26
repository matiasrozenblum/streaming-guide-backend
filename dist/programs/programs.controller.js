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
exports.ProgramsController = void 0;
const common_1 = require("@nestjs/common");
const programs_service_1 = require("./programs.service");
const create_program_dto_1 = require("./dto/create-program.dto");
const programs_entity_1 = require("./programs.entity");
const swagger_1 = require("@nestjs/swagger");
let ProgramsController = class ProgramsController {
    programsService;
    constructor(programsService) {
        this.programsService = programsService;
    }
    findAll() {
        return this.programsService.findAll();
    }
    findOne(id) {
        return this.programsService.findOne(id);
    }
    create(createProgramDto) {
        return this.programsService.create(createProgramDto);
    }
    remove(id) {
        return this.programsService.remove(id);
    }
};
exports.ProgramsController = ProgramsController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Obtener todos los programas' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Lista de programas', type: [programs_entity_1.Program] }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ProgramsController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Obtener un programa por ID' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Programa encontrado', type: programs_entity_1.Program }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ProgramsController.prototype, "findOne", null);
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: 'Crear un nuevo programa' }),
    (0, swagger_1.ApiResponse)({ status: 201, description: 'Programa creado', type: programs_entity_1.Program }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_program_dto_1.CreateProgramDto]),
    __metadata("design:returntype", Promise)
], ProgramsController.prototype, "create", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Eliminar un programa por ID' }),
    (0, swagger_1.ApiResponse)({ status: 204, description: 'Programa eliminado' }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ProgramsController.prototype, "remove", null);
exports.ProgramsController = ProgramsController = __decorate([
    (0, swagger_1.ApiTags)('programs'),
    (0, common_1.Controller)('programs'),
    __metadata("design:paramtypes", [programs_service_1.ProgramsService])
], ProgramsController);
//# sourceMappingURL=programs.controller.js.map