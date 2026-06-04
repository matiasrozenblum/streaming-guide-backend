const DAYS_OF_WEEK = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

function nextDay(day: string): string {
  const idx = DAYS_OF_WEEK.indexOf(day.toLowerCase());
  return idx === -1 ? day : DAYS_OF_WEEK[(idx + 1) % 7];
}

function timeToMinutes(time: string): number {
  const [h = 0, m = 0] = time.split(':').map(Number);
  return h * 60 + m;
}

/**
 * For old mobile clients that cannot render cross-midnight blocks:
 * splits any schedule whose end_time < start_time into two schedules:
 *   - block1: original start_time → "23:59" (same day)
 *   - block2: "00:00" → original end_time (next day)
 * All other fields are preserved as-is; both blocks share the original id.
 *
 * Operates on the ChannelWithSchedules[] response shape:
 *   [{ channel: {...}, schedules: [{id, day_of_week, start_time, end_time, program, ...}] }]
 */
export function splitCrossMidnightSchedules<T extends { schedules: any[] }>(
  channels: T[],
): T[] {
  return channels.map((channelData) => ({
    ...channelData,
    schedules: channelData.schedules.flatMap((schedule) => {
      if (
        timeToMinutes(schedule.end_time) >= timeToMinutes(schedule.start_time)
      ) {
        return [schedule];
      }

      const block1 = { ...schedule, end_time: '23:59' };
      const block2 = {
        ...schedule,
        day_of_week: nextDay(schedule.day_of_week),
        start_time: '00:00',
      };
      return [block1, block2];
    }),
  }));
}
