import { PanelistsService } from './panelists.service';
import { CreatePanelistDto } from './dto/create-panelist.dto';
import { Panelist } from './panelists.entity';
export declare class PanelistsController {
    private readonly panelistsService;
    constructor(panelistsService: PanelistsService);
    findAll(): Promise<Panelist[]>;
    findOne(id: string): Promise<Panelist>;
    create(createPanelistDto: CreatePanelistDto): Promise<Panelist>;
    remove(id: string): Promise<void>;
}
