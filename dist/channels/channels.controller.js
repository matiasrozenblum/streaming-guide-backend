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
exports.ChannelsController = void 0;
const common_1 = require("@nestjs/common");
const channels_service_1 = require("./channels.service");
const create_channel_dto_1 = require("./dto/create-channel.dto");
const channels_entity_1 = require("./channels.entity");
const swagger_1 = require("@nestjs/swagger");
let ChannelsController = class ChannelsController {
    channelsService;
    constructor(channelsService) {
        this.channelsService = channelsService;
    }
    findAll() {
        return this.channelsService.findAll();
    }
    findOne(id) {
        return this.channelsService.findOne(id);
    }
    create(createChannelDto) {
        return this.channelsService.create(createChannelDto);
    }
    remove(id) {
        return this.channelsService.remove(id);
    }
};
exports.ChannelsController = ChannelsController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Obtener todos los canales' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Lista de canales', type: [channels_entity_1.Channel] }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ChannelsController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Obtener un canal por ID' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Canal encontrado', type: channels_entity_1.Channel }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ChannelsController.prototype, "findOne", null);
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: 'Crear un nuevo canal' }),
    (0, swagger_1.ApiResponse)({ status: 201, description: 'Canal creado', type: channels_entity_1.Channel }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_channel_dto_1.CreateChannelDto]),
    __metadata("design:returntype", Promise)
], ChannelsController.prototype, "create", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Eliminar un canal por ID' }),
    (0, swagger_1.ApiResponse)({ status: 204, description: 'Canal eliminado' }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ChannelsController.prototype, "remove", null);
exports.ChannelsController = ChannelsController = __decorate([
    (0, swagger_1.ApiTags)('channels'),
    (0, common_1.Controller)('channels'),
    __metadata("design:paramtypes", [channels_service_1.ChannelsService])
], ChannelsController);
//# sourceMappingURL=channels.controller.js.map