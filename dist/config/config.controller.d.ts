import { ConfigService } from './config.service';
export declare class ConfigController {
    private readonly configService;
    constructor(configService: ConfigService);
    findAll(): Promise<import("./config.entity").Config[]>;
    get(key: string): Promise<string | null>;
    set(body: {
        key: string;
        value: string;
    }): Promise<import("./config.entity").Config>;
}
