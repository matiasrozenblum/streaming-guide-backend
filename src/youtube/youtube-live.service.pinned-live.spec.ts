import axios from 'axios';
import { YoutubeLiveService } from './youtube-live.service';
import { SchedulesService } from '../schedules/schedules.service';
import { RedisService } from '../redis/redis.service';
import { SentryService } from '../sentry/sentry.service';

jest.mock('axios');

const CHANNEL_ID = 'UCj6PcyLvpnIRT_2W_mwa9Aw';
const HANDLE = 'todonoticias';
const VIDEO_ID = 'cb12KmMMDJA';

/**
 * Regression tests for the Todo Noticias incident (2026-10-06): the channel's permanent
 * broadcast sat at 84k concurrent viewers while search?eventType=live returned 0 items.
 *
 * The stream had been open since 2023-10-01, which puts it outside both discovery paths
 * the service had: it is absent from the channel's search index entirely (a plain
 * search?order=date over its 77k indexed videos does not return it either), and it is
 * ~20k entries deep in the uploads playlist, past the cap playlistItems will page to.
 *
 * The pinned videoId closes that gap, and these tests hold its two halves in place:
 * resolving through the pin must stay cheap and must not trust a stale pin, and
 * re-discovery must only pin a video that is genuinely live and genuinely this channel's,
 * and must find it through the channel's UULV (live streams) playlist — the one listing
 * the API still returns a permanent broadcast in.
 */
describe('YoutubeLiveService pinned permanent broadcast', () => {
  let service: YoutubeLiveService;
  let redisService: jest.Mocked<RedisService>;
  let channelsRepository: { findOne: jest.Mock; update: jest.Mock };
  const mockedAxios = axios as jest.Mocked<typeof axios>;

  const snippetFor = (overrides: Record<string, any> = {}) => ({
    channelId: CHANNEL_ID,
    title: 'TN EN VIVO - SEGUÍ LA TRANSMISIÓN EN VIVO DE TODO NOTICIAS',
    description: 'El canal líder de noticias en la Argentina.',
    publishedAt: '2023-10-01T19:46:03Z',
    liveBroadcastContent: 'live',
    thumbnails: {
      medium: { url: `https://i.ytimg.com/vi/${VIDEO_ID}/mqdefault_live.jpg` },
    },
    ...overrides,
  });

  const resolvePinned = () =>
    (service as any).resolvePinnedLiveStream(CHANNEL_ID, HANDLE);

  const rediscover = () =>
    (service as any).rediscoverPinnedLiveStream(CHANNEL_ID, HANDLE);

  beforeEach(() => {
    redisService = {
      get: jest.fn().mockResolvedValue(null),
      mget: jest.fn().mockResolvedValue([]),
      set: jest.fn(),
      del: jest.fn(),
      incr: jest.fn(),
      setNX: jest.fn().mockResolvedValue(true),
    } as any;
    channelsRepository = {
      findOne: jest.fn().mockResolvedValue({ youtube_live_video_id: null }),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    service = new YoutubeLiveService(
      { canFetchLive: jest.fn().mockResolvedValue(true) } as any,
      {
        findAll: jest.fn().mockResolvedValue([]),
        findByDay: jest.fn(),
        enrichSchedules: jest.fn((s) => Promise.resolve(s)),
      } as any as jest.Mocked<SchedulesService>,
      redisService,
      {
        captureMessage: jest.fn(),
        captureException: jest.fn(),
        setTag: jest.fn(),
        addBreadcrumb: jest.fn(),
      } as any as jest.Mocked<SentryService>,
      { sendEmail: jest.fn() } as any,
      channelsRepository as any,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
    mockedAxios.get.mockReset();
  });

  describe('resolving through the pin', () => {
    it('returns the stream without ever calling search', async () => {
      channelsRepository.findOne.mockResolvedValue({
        youtube_live_video_id: VIDEO_ID,
      });
      mockedAxios.get.mockResolvedValue({
        data: { items: [{ snippet: snippetFor() }] },
      });

      const stream = await resolvePinned();

      expect(stream).toMatchObject({
        videoId: VIDEO_ID,
        liveBroadcastContent: 'live',
        thumbnailUrl: `https://i.ytimg.com/vi/${VIDEO_ID}/mqdefault_live.jpg`,
      });
      // One videos?id= call: 1 quota unit, against the 100 a search would have cost.
      expect(mockedAxios.get).toHaveBeenCalledTimes(1);
      expect(mockedAxios.get.mock.calls[0][0]).toContain('/videos');
    });

    it('falls through when there is no pin yet', async () => {
      expect(await resolvePinned()).toBeNull();
      expect(mockedAxios.get).not.toHaveBeenCalled();
    });

    it('falls through when the pinned broadcast has ended', async () => {
      // An ended livestream keeps its id but reports liveBroadcastContent=none.
      channelsRepository.findOne.mockResolvedValue({
        youtube_live_video_id: VIDEO_ID,
      });
      mockedAxios.get.mockResolvedValue({
        data: {
          items: [{ snippet: snippetFor({ liveBroadcastContent: 'none' }) }],
        },
      });

      expect(await resolvePinned()).toBeNull();
    });

    it('rejects a pin that now points at another channel', async () => {
      channelsRepository.findOne.mockResolvedValue({
        youtube_live_video_id: VIDEO_ID,
      });
      mockedAxios.get.mockResolvedValue({
        data: {
          items: [{ snippet: snippetFor({ channelId: 'UCsomeoneelse' }) }],
        },
      });

      expect(await resolvePinned()).toBeNull();
    });
  });

  describe('re-discovery via the live-streams playlist', () => {
    const PLAYLIST_ID = 'UULVj6PcyLvpnIRT_2W_mwa9Aw';

    /** playlistItems page for the channel's UULV (live streams) playlist. */
    const playlistPage = (ids: string[]) => ({
      data: {
        items: ids.map((id) => ({ snippet: { resourceId: { videoId: id } } })),
      },
    });

    /** videos?id= batch response. */
    const hoursAgo = (h: number) =>
      new Date(Date.now() - h * 3_600_000).toISOString();

    /**
     * videos?id= batch response. `hours` is how long the broadcast has been on air —
     * the signal that separates a permanent 24/7 stream from a per-program one. Defaults
     * to TN's real shape (years), since most cases here are about the permanent stream.
     */
    const videosBatch = (vids: Array<Record<string, any>>) => ({
      data: {
        items: vids.map((v) => ({
          id: v.id,
          snippet: snippetFor({
            title: v.title ?? 'TN EN VIVO',
            liveBroadcastContent: v.live ?? 'live',
            channelId: v.channelId ?? CHANNEL_ID,
          }),
          liveStreamingDetails:
            v.hours === null
              ? {}
              : { actualStartTime: hoursAgo(v.hours ?? 26418) },
        })),
      },
    });

    it('pins the live entry found in the playlist and returns it', async () => {
      mockedAxios.get
        .mockResolvedValueOnce(playlistPage(['oldA', 'oldB', VIDEO_ID]))
        .mockResolvedValueOnce(
          videosBatch([
            { id: 'oldA', live: 'none' },
            { id: 'oldB', live: 'none' },
            { id: VIDEO_ID, live: 'live' },
          ]),
        );

      const stream = await rediscover();

      expect(stream).toMatchObject({ videoId: VIDEO_ID });
      expect(channelsRepository.update).toHaveBeenCalledWith(
        { youtube_channel_id: CHANNEL_ID },
        { youtube_live_video_id: VIDEO_ID },
      );
    });

    it('reads the UULV playlist and batches the whole page in one videos call', async () => {
      const ids = Array.from({ length: 50 }, (_, i) => `vid${i}`);
      mockedAxios.get
        .mockResolvedValueOnce(playlistPage(ids))
        .mockResolvedValueOnce(videosBatch([{ id: 'vid7', live: 'live' }]));

      await rediscover();

      // 2 quota units total, against the 100 a search would have cost.
      expect(mockedAxios.get).toHaveBeenCalledTimes(2);
      expect(mockedAxios.get.mock.calls[0][1]?.params.playlistId).toBe(
        PLAYLIST_ID,
      );
      expect(mockedAxios.get.mock.calls[1][1]?.params.id).toBe(ids.join(','));
      // liveStreamingDetails rides along free: videos?id= is 1 unit regardless of parts.
      expect(mockedAxios.get.mock.calls[1][1]?.params.part).toBe(
        'snippet,liveStreamingDetails',
      );
    });

    it('pins nothing when the playlist holds only ended broadcasts', async () => {
      mockedAxios.get
        .mockResolvedValueOnce(playlistPage(['oldA', 'oldB']))
        .mockResolvedValueOnce(
          videosBatch([
            { id: 'oldA', live: 'none' },
            { id: 'oldB', live: 'none' },
          ]),
        );

      expect(await rediscover()).toBeNull();
      expect(channelsRepository.update).not.toHaveBeenCalled();
    });

    it('never pins a video owned by a different channel', async () => {
      mockedAxios.get
        .mockResolvedValueOnce(playlistPage([VIDEO_ID]))
        .mockResolvedValueOnce(
          videosBatch([
            { id: VIDEO_ID, live: 'live', channelId: 'UCsomeoneelse' },
          ]),
        );

      expect(await rediscover()).toBeNull();
      expect(channelsRepository.update).not.toHaveBeenCalled();
    });

    it('picks the broadcast matching the on-air program when several are live', async () => {
      mockedAxios.get
        .mockResolvedValueOnce(playlistPage(['otro', VIDEO_ID]))
        .mockResolvedValueOnce(
          videosBatch([
            { id: 'otro', live: 'live', title: 'ARCHIVO | Copa America 2024' },
            { id: VIDEO_ID, live: 'live', title: 'TN DE 10 A 13 EN VIVO' },
          ]),
        );

      const stream = await (service as any).rediscoverPinnedLiveStream(
        CHANNEL_ID,
        HANDLE,
        'TN DE 10 A 13',
      );

      expect(stream).toMatchObject({ videoId: VIDEO_ID });
    });

    it('survives a channel with no live-streams playlist (404)', async () => {
      mockedAxios.get.mockRejectedValue(
        new Error('Request failed with status code 404'),
      );

      expect(await rediscover()).toBeNull();
      expect(channelsRepository.update).not.toHaveBeenCalled();
    });

    it('does not pin a stream that has only been on air for hours', async () => {
      // A per-program broadcast surfaced because search blipped. Pinning it would make the
      // channel skip search from then on, losing its other simultaneous streams and the
      // title matching that picks the right one for the program on air.
      mockedAxios.get
        .mockResolvedValueOnce(playlistPage([VIDEO_ID]))
        .mockResolvedValueOnce(
          videosBatch([{ id: VIDEO_ID, live: 'live', hours: 1.1 }]),
        );

      // Still returned — discovery rescues any channel whose search came up empty.
      expect(await rediscover()).toMatchObject({ videoId: VIDEO_ID });
      expect(channelsRepository.update).not.toHaveBeenCalled();
    });

    it('does not pin the longest per-program stream seen in the wild', async () => {
      // Urbana Play ran 5.8h across several programs — still nowhere near permanent.
      mockedAxios.get
        .mockResolvedValueOnce(playlistPage([VIDEO_ID]))
        .mockResolvedValueOnce(
          videosBatch([{ id: VIDEO_ID, live: 'live', hours: 5.8 }]),
        );

      await rediscover();

      expect(channelsRepository.update).not.toHaveBeenCalled();
    });

    it('pins a broadcast that has been up longer than a day', async () => {
      mockedAxios.get
        .mockResolvedValueOnce(playlistPage([VIDEO_ID]))
        .mockResolvedValueOnce(
          videosBatch([{ id: VIDEO_ID, live: 'live', hours: 25 }]),
        );

      await rediscover();

      expect(channelsRepository.update).toHaveBeenCalledWith(
        { youtube_channel_id: CHANNEL_ID },
        { youtube_live_video_id: VIDEO_ID },
      );
    });

    it('does not pin when the API reports no actualStartTime', async () => {
      mockedAxios.get
        .mockResolvedValueOnce(playlistPage([VIDEO_ID]))
        .mockResolvedValueOnce(
          videosBatch([{ id: VIDEO_ID, live: 'live', hours: null }]),
        );

      expect(await rediscover()).toMatchObject({ videoId: VIDEO_ID });
      expect(channelsRepository.update).not.toHaveBeenCalled();
    });

    it('returns null without calling the API while inside the cooldown', async () => {
      redisService.setNX.mockResolvedValue(false);

      expect(await rediscover()).toBeNull();
      expect(mockedAxios.get).not.toHaveBeenCalled();
    });

    it('still returns the stream when persisting the pin fails', async () => {
      // The pin is an optimisation; the liveness answer is already correct without it.
      mockedAxios.get
        .mockResolvedValueOnce(playlistPage([VIDEO_ID]))
        .mockResolvedValueOnce(videosBatch([{ id: VIDEO_ID, live: 'live' }]));
      channelsRepository.update.mockRejectedValue(new Error('db down'));

      expect(await rediscover()).toMatchObject({ videoId: VIDEO_ID });
    });
  });
});
