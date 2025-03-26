import { ChannelsService } from './channels.service';
import { CreateChannelDto } from './dto/create-channel.dto';
import { Channel } from './channels.entity';
export declare class ChannelsController {
    private readonly channelsService;
    constructor(channelsService: ChannelsService);
    findAll(): Promise<Channel[]>;
    findOne(id: string): Promise<Channel>;
    create(createChannelDto: CreateChannelDto): Promise<Channel>;
    remove(id: string): Promise<void>;
}
