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
exports.Panelist = void 0;
const typeorm_1 = require("typeorm");
const programs_entity_1 = require("../programs/programs.entity");
let Panelist = class Panelist {
    id;
    name;
    photo_url;
    bio;
    programs;
};
exports.Panelist = Panelist;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)(),
    __metadata("design:type", Number)
], Panelist.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], Panelist.prototype, "name", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true }),
    __metadata("design:type", String)
], Panelist.prototype, "photo_url", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true }),
    __metadata("design:type", String)
], Panelist.prototype, "bio", void 0);
__decorate([
    (0, typeorm_1.ManyToMany)(() => programs_entity_1.Program, (program) => program.panelists),
    __metadata("design:type", Array)
], Panelist.prototype, "programs", void 0);
exports.Panelist = Panelist = __decorate([
    (0, typeorm_1.Entity)()
], Panelist);
//# sourceMappingURL=panelists.entity.js.map