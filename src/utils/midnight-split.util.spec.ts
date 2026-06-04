import { splitCrossMidnightSchedules } from './midnight-split.util';

function makeChannel(schedules: any[]) {
  return [{ channel: { id: 1, name: 'Test' }, schedules }];
}

describe('splitCrossMidnightSchedules', () => {
  const baseSchedule = {
    id: 42,
    day_of_week: 'monday',
    subscribed: false,
    isWeeklyOverride: false,
    overrideType: null,
    program: { id: 1, name: 'Night Show', is_live: false },
  };

  it('leaves normal schedules unchanged', () => {
    const schedule = { ...baseSchedule, start_time: '10:00', end_time: '12:00' };
    const result = splitCrossMidnightSchedules(makeChannel([schedule]));
    expect(result[0].schedules).toHaveLength(1);
    expect(result[0].schedules[0]).toEqual(schedule);
  });

  it('leaves a schedule ending exactly at 23:59 unchanged', () => {
    const schedule = { ...baseSchedule, start_time: '22:00', end_time: '23:59' };
    const result = splitCrossMidnightSchedules(makeChannel([schedule]));
    expect(result[0].schedules).toHaveLength(1);
  });

  it('splits a cross-midnight schedule into two blocks', () => {
    const schedule = { ...baseSchedule, start_time: '23:00', end_time: '00:30' };
    const result = splitCrossMidnightSchedules(makeChannel([schedule]));
    const schedules = result[0].schedules;
    expect(schedules).toHaveLength(2);

    // Block 1: original day, original start, truncated to 23:59
    expect(schedules[0].id).toBe(42);
    expect(schedules[0].day_of_week).toBe('monday');
    expect(schedules[0].start_time).toBe('23:00');
    expect(schedules[0].end_time).toBe('23:59');

    // Block 2: next day, starts at 00:00, original end
    expect(schedules[1].id).toBe(42);
    expect(schedules[1].day_of_week).toBe('tuesday');
    expect(schedules[1].start_time).toBe('00:00');
    expect(schedules[1].end_time).toBe('00:30');
  });

  it('advances day_of_week correctly across week boundary (sunday → monday)', () => {
    const schedule = { ...baseSchedule, day_of_week: 'sunday', start_time: '23:30', end_time: '01:00' };
    const result = splitCrossMidnightSchedules(makeChannel([schedule]));
    expect(result[0].schedules[0].day_of_week).toBe('sunday');
    expect(result[0].schedules[1].day_of_week).toBe('monday');
  });

  it('advances day_of_week correctly for saturday → sunday', () => {
    const schedule = { ...baseSchedule, day_of_week: 'saturday', start_time: '23:00', end_time: '02:00' };
    const result = splitCrossMidnightSchedules(makeChannel([schedule]));
    expect(result[0].schedules[1].day_of_week).toBe('sunday');
  });

  it('preserves all other schedule fields on both blocks', () => {
    const schedule = {
      ...baseSchedule,
      start_time: '23:00',
      end_time: '00:30',
      subscribed: true,
      isWeeklyOverride: true,
    };
    const result = splitCrossMidnightSchedules(makeChannel([schedule]));
    const [b1, b2] = result[0].schedules;
    expect(b1.subscribed).toBe(true);
    expect(b1.isWeeklyOverride).toBe(true);
    expect(b2.subscribed).toBe(true);
    expect(b2.isWeeklyOverride).toBe(true);
    expect(b1.program).toEqual(baseSchedule.program);
    expect(b2.program).toEqual(baseSchedule.program);
  });

  it('handles multiple schedules per channel, splitting only cross-midnight ones', () => {
    const normal = { ...baseSchedule, start_time: '10:00', end_time: '12:00' };
    const crossMidnight = { ...baseSchedule, id: 99, start_time: '23:00', end_time: '01:00' };
    const result = splitCrossMidnightSchedules(makeChannel([normal, crossMidnight]));
    expect(result[0].schedules).toHaveLength(3); // 1 normal + 2 split
    expect(result[0].schedules[0]).toEqual(normal);
    expect(result[0].schedules[1].id).toBe(99);
    expect(result[0].schedules[1].end_time).toBe('23:59');
    expect(result[0].schedules[2].id).toBe(99);
    expect(result[0].schedules[2].start_time).toBe('00:00');
  });

  it('handles empty schedules array', () => {
    const result = splitCrossMidnightSchedules(makeChannel([]));
    expect(result[0].schedules).toHaveLength(0);
  });

  it('handles empty channels array', () => {
    expect(splitCrossMidnightSchedules([])).toEqual([]);
  });
});
