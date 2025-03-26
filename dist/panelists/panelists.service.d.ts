import { Repository } from 'typeorm';
import { Panelist } from './panelists.entity';
import { CreatePanelistDto } from './dto/create-panelist.dto';
export declare class PanelistsService {
    private panelistsRepository;
    constructor(panelistsRepository: Repository<Panelist>);
    findAll(): Promise<Panelist[]>;
    findOne(id: string): Promise<Panelist>;
    create(createPanelistDto: CreatePanelistDto): Promise<Panelist>;
    remove(id: string): Promise<void>;
}
