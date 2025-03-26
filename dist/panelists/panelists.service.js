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
exports.PanelistsService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const panelists_entity_1 = require("./panelists.entity");
let PanelistsService = class PanelistsService {
    panelistsRepository;
    constructor(panelistsRepository) {
        this.panelistsRepository = panelistsRepository;
    }
    findAll() {
        return this.panelistsRepository.find();
    }
    async findOne(id) {
        const channel = await this.panelistsRepository.findOne({ where: { id } });
        if (!channel) {
            throw new common_1.NotFoundException(`Channel with ID ${id} not found`);
        }
        return channel;
    }
    create(createPanelistDto) {
        const channel = this.panelistsRepository.create(createPanelistDto);
        return this.panelistsRepository.save(channel);
    }
    remove(id) {
        return this.panelistsRepository.delete(id).then(() => { });
    }
};
exports.PanelistsService = PanelistsService;
exports.PanelistsService = PanelistsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(panelists_entity_1.Panelist)),
    __metadata("design:paramtypes", [typeorm_2.Repository])
], PanelistsService);
//# sourceMappingURL=panelists.service.js.map