"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const config_1 = require("@nestjs/config");
const channels_entity_1 = require("./channels/channels.entity");
const programs_entity_1 = require("./programs/programs.entity");
const schedules_entity_1 = require("./schedules/schedules.entity");
const panelists_entity_1 = require("./panelists/panelists.entity");
const channels_module_1 = require("./channels/channels.module");
const programs_module_1 = require("./programs/programs.module");
const schedules_module_1 = require("./schedules/schedules.module");
const panelists_module_1 = require("./panelists/panelists.module");
const scraper_module_1 = require("./scraper/scraper.module");
const app_controller_1 = require("./app.controller");
const schedule_1 = require("@nestjs/schedule");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            schedule_1.ScheduleModule.forRoot(),
            config_1.ConfigModule.forRoot(),
            typeorm_1.TypeOrmModule.forRoot({
                type: 'postgres',
                url: process.env.DATABASE_URL,
                ssl: {
                    rejectUnauthorized: false,
                },
                autoLoadEntities: true,
                synchronize: true,
                entities: [channels_entity_1.Channel, programs_entity_1.Program, schedules_entity_1.Schedule, panelists_entity_1.Panelist],
                logging: true,
            }),
            typeorm_1.TypeOrmModule.forFeature([channels_entity_1.Channel, programs_entity_1.Program, schedules_entity_1.Schedule, panelists_entity_1.Panelist]),
            channels_module_1.ChannelsModule,
            programs_module_1.ProgramsModule,
            schedules_module_1.SchedulesModule,
            panelists_module_1.PanelistsModule,
            scraper_module_1.ScraperModule,
        ],
        controllers: [app_controller_1.AppController],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map