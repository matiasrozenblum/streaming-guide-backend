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
exports.ConfigService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const config_entity_1 = require("./config.entity");
const typeorm_2 = require("typeorm");
let ConfigService = class ConfigService {
    configRepository;
    constructor(configRepository) {
        this.configRepository = configRepository;
    }
    async get(key) {
        const entry = await this.configRepository.findOne({ where: { key } });
        return entry?.value ?? null;
    }
    async getNumber(key) {
        const val = await this.get(key);
        return val ? Number(val) : null;
    }
    async getBoolean(key) {
        const val = await this.get(key);
        return val === 'true';
    }
    async set(key, value) {
        let config = await this.configRepository.findOne({ where: { key } });
        if (config) {
            config.value = value;
        }
        else {
            config = this.configRepository.create({ key, value });
        }
        return this.configRepository.save(config);
    }
    async findAll() {
        return this.configRepository.find({
            order: { updated_at: 'DESC' },
        });
    }
};
exports.ConfigService = ConfigService;
exports.ConfigService = ConfigService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(config_entity_1.Config)),
    __metadata("design:paramtypes", [typeorm_2.Repository])
], ConfigService);
//# sourceMappingURL=config.service.js.map