import { NotifyAndRevalidateUtil } from './notify-and-revalidate.util';

const mockSet = jest.fn();

const mockRedisService = {
  set: mockSet,
};

describe('NotifyAndRevalidateUtil', () => {
  const frontendUrl = 'https://frontend.test';
  const revalidateSecret = 'testsecret';
  let util: NotifyAndRevalidateUtil;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn().mockResolvedValue({ status: 200, text: async () => 'ok' });
    util = new NotifyAndRevalidateUtil(
      mockRedisService as any,
      frontendUrl,
      revalidateSecret
    );
  });

  it('writes notification to Redis', async () => {
    await util.notifyAndRevalidate({
      eventType: 'test_event',
      entity: 'test_entity',
      entityId: 123,
      payload: { foo: 'bar' },
      revalidatePaths: ['/'],
    });
    expect(mockSet).toHaveBeenCalledWith(
      expect.stringMatching(/^live_notification:test_entity:123:/),
      expect.stringContaining('test_event'),
      300
    );
  });

  it('calls the revalidation endpoint with correct params', async () => {
    await util.notifyAndRevalidate({
      eventType: 'test_event',
      entity: 'test_entity',
      entityId: 123,
      payload: {},
      revalidatePaths: ['/foo', '/bar'],
    });
    // Revalidation is fire-and-forget; flush microtasks so fetch promises settle
    await new Promise(resolve => process.nextTick(resolve));
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://frontend.test/api/revalidate?x-vercel-set-bypass-cookie=true&x-vercel-protection-bypass=testsecret',
      expect.objectContaining({
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-vercel-protection-bypass': revalidateSecret,
        },
        body: JSON.stringify({ path: '/foo', secret: revalidateSecret }),
      })
    );
    expect(global.fetch).toHaveBeenCalledWith(
      'https://frontend.test/api/revalidate?x-vercel-set-bypass-cookie=true&x-vercel-protection-bypass=testsecret',
      expect.objectContaining({
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-vercel-protection-bypass': revalidateSecret,
        },
        body: JSON.stringify({ path: '/bar', secret: revalidateSecret }),
      })
    );
  });

  it('handles fetch errors gracefully', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('fail'));
    await util.notifyAndRevalidate({
      eventType: 'test_event',
      entity: 'test_entity',
      entityId: 123,
      payload: {},
      revalidatePaths: ['/'],
    });
    // Flush microtasks to let the background revalidation error be caught
    await new Promise(resolve => process.nextTick(resolve));
    // Should not throw — errors are caught internally
  });
}); 