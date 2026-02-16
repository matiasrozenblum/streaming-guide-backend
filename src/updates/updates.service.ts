import { Injectable } from '@nestjs/common';
import { StreamerLiveStatusService } from '../streamers/streamer-live-status.service';

@Injectable()
export class UpdatesService {
    constructor(
        private readonly streamerLiveStatusService: StreamerLiveStatusService,
    ) { }

    async getLiveStatus() {
        const liveMap = await this.streamerLiveStatusService.getAllLiveStatuses();
        // Start with all live IDs
        const liveStreamerIds = Array.from(liveMap.keys());

        // We could enrich this with more data if needed, but for now just returning IDs 
        // allows the client to know who to highlight.
        // Spec suggests "/updates/poll"

        return {
            liveStreamerIds,
            timestamp: Date.now(),
        };
    }
}
