import { Repository } from 'typeorm';
import { Program } from './programs.entity';
import { CreateProgramDto } from './dto/create-program.dto';
export declare class ProgramsService {
    private programsRepository;
    constructor(programsRepository: Repository<Program>);
    findAll(): Promise<Program[]>;
    findOne(id: string): Promise<Program>;
    create(createProgramDto: CreateProgramDto): Promise<Program>;
    remove(id: string): Promise<void>;
}
