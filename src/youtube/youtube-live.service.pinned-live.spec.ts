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
 * re-discovery must only pin a video that is genuinely live and genuinely this channel's.
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

  /** The canonical tag YouTube serves on /@handle/live for a channel with an open stream. */
  const livePageHtml = (videoId: string) =>
    `<html><head><link rel="canonical" href="https://www.youtube.com/watch?v=${videoId}"></head></html>`;

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

  describe('re-discovery', () => {
    it('pins the canonical video from the /live page and returns it', async () => {
      mockedAxios.get
        .mockResolvedValueOnce({ data: livePageHtml(VIDEO_ID) })
        .mockResolvedValueOnce({
          data: { items: [{ snippet: snippetFor() }] },
        });

      const stream = await rediscover();

      expect(stream).toMatchObject({ videoId: VIDEO_ID });
      expect(channelsRepository.update).toHaveBeenCalledWith(
        { youtube_channel_id: CHANNEL_ID },
        { youtube_live_video_id: VIDEO_ID },
      );
    });

    it('does not pin a canonical video that is not live', async () => {
      // /live resolves to the *last* broadcast when a channel is offline, so the
      // canonical tag alone is not evidence of anything being on air.
      mockedAxios.get
        .mockResolvedValueOnce({ data: livePageHtml(VIDEO_ID) })
        .mockResolvedValueOnce({
          data: {
            items: [{ snippet: snippetFor({ liveBroadcastContent: 'none' }) }],
          },
        });

      expect(await rediscover()).toBeNull();
      expect(channelsRepository.update).not.toHaveBeenCalled();
    });

    it('does not pin a video owned by a different channel', async () => {
      mockedAxios.get
        .mockResolvedValueOnce({ data: livePageHtml(VIDEO_ID) })
        .mockResolvedValueOnce({
          data: {
            items: [{ snippet: snippetFor({ channelId: 'UCsomeoneelse' }) }],
          },
        });

      expect(await rediscover()).toBeNull();
      expect(channelsRepository.update).not.toHaveBeenCalled();
    });

    it('returns null without scraping while inside the cooldown', async () => {
      redisService.setNX.mockResolvedValue(false);

      expect(await rediscover()).toBeNull();
      expect(mockedAxios.get).not.toHaveBeenCalled();
    });

    it('survives a /live page that 404s', async () => {
      // Channels whose handle has no /live route at all (axios rejects on 404).
      mockedAxios.get.mockRejectedValue(
        new Error('Request failed with status code 404'),
      );

      expect(await rediscover()).toBeNull();
      expect(channelsRepository.update).not.toHaveBeenCalled();
    });

    it('still returns the stream when persisting the pin fails', async () => {
      // The pin is an optimisation; the liveness answer is already correct without it.
      mockedAxios.get
        .mockResolvedValueOnce({ data: livePageHtml(VIDEO_ID) })
        .mockResolvedValueOnce({
          data: { items: [{ snippet: snippetFor() }] },
        });
      channelsRepository.update.mockRejectedValue(new Error('db down'));

      expect(await rediscover()).toMatchObject({ videoId: VIDEO_ID });
    });
  });
});
