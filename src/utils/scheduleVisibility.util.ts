/**
 * Visibility helpers for schedules.
 *
 * A program (or channel) with `is_visible = false` is a backoffice-only record: it must never
 * influence live detection, title matching, block TTL calculation or not-found escalation.
 * Only the backoffice reads them, and it does so with its own (raw) queries.
 *
 * `undefined` is treated as visible to match the DB default (`true`) and to stay safe when a
 * query selects a subset of columns.
 */

interface ScheduleLike {
  program?: {
    is_visible?: boolean;
    channel?: { is_visible?: boolean } | null;
  } | null;
}

export function isScheduleVisible(schedule: ScheduleLike): boolean {
  return (
    schedule?.program?.is_visible !== false &&
    schedule?.program?.channel?.is_visible !== false
  );
}

export function filterVisibleSchedules<T extends ScheduleLike>(
  schedules: T[],
): T[] {
  return (schedules || []).filter(isScheduleVisible);
}
