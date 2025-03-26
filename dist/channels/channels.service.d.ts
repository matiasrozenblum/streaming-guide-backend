import { Repository } from 'typeorm';
import { Channel } from './channels.entity';
import { CreateChannelDto } from './dto/create-channel.dto';
export declare class ChannelsService {
    private channelsRepository;
    constructor(channelsRepository: Repository<Channel>);
    findAll(): Promise<Channel[]>;
    findOne(id: string): Promise<Channel>;
    create(createChannelDto: CreateChannelDto): Promise<Channel>;
    remove(id: string): Promise<void>;
}
