import { Config } from './config.entity';
import { Repository } from 'typeorm';
export declare class ConfigService {
    private configRepository;
    constructor(configRepository: Repository<Config>);
    get(key: string): Promise<string | null>;
    getNumber(key: string): Promise<number | null>;
    getBoolean(key: string): Promise<boolean>;
    set(key: string, value: string): Promise<Config>;
    findAll(): Promise<Config[]>;
}
