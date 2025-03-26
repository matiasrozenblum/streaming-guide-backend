import { ProgramsService } from './programs.service';
import { CreateProgramDto } from './dto/create-program.dto';
import { Program } from './programs.entity';
export declare class ProgramsController {
    private readonly programsService;
    constructor(programsService: ProgramsService);
    findAll(): Promise<Program[]>;
    findOne(id: string): Promise<Program>;
    create(createProgramDto: CreateProgramDto): Promise<Program>;
    remove(id: string): Promise<void>;
}
