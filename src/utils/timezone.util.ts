import * as dayjs from 'dayjs';
import * as utc from 'dayjs/plugin/utc';
import * as timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * Centralized timezone utility to ensure consistent timezone handling across the application
 * All times should be handled in Argentina/Buenos_Aires timezone
 */
export class TimezoneUtil {
  private static readonly ARGENTINA_TIMEZONE = 'America/Argentina/Buenos_Aires';

  /**
   * Get current time in Argentina timezone
   */
  static now(): dayjs.Dayjs {
    return dayjs().tz(this.ARGENTINA_TIMEZONE);
  }

  /**
   * Convert a date to Argentina timezone
   */
  static toArgentinaTime(date: Date | string | dayjs.Dayjs): dayjs.Dayjs {
    return dayjs(date).tz(this.ARGENTINA_TIMEZONE);
  }

  /**
   * Parse a date string (YYYY-MM-DD) directly in Argentina timezone.
   * Unlike toArgentinaTime, this interprets the string AS a date in Argentina,
   * rather than parsing as UTC and then converting (which shifts the day back).
   */
  static parseInArgentinaTime(dateStr: string): dayjs.Dayjs {
    return dayjs.tz(dateStr, this.ARGENTINA_TIMEZONE);
  }

  /**
   * Get current time formatted as HH:mm:ss in Argentina timezone
   */
  static currentTimeString(): string {
    return this.now().format('HH:mm:ss');
  }

  /**
   * Get current day of week in lowercase (e.g., 'monday', 'tuesday')
   */
  static currentDayOfWeek(): string {
    return this.now().format('dddd').toLowerCase();
  }

  /**
   * Get current date formatted as YYYY-MM-DD in Argentina timezone
   */
  static currentDateString(): string {
    return this.now().format('YYYY-MM-DD');
  }

  /**
   * Get current time in minutes since midnight (Argentina timezone)
   */
  static currentTimeInMinutes(): number {
    const now = this.now();
    return now.hour() * 60 + now.minute();
  }

  /**
   * Create a moment for today at a specific time in Argentina timezone
   */
  static todayAtTime(timeString: string): dayjs.Dayjs {
    const [hours, minutes] = timeString.split(':').map(Number);
    return this.now().startOf('day').add(hours, 'hour').add(minutes, 'minute');
  }

  /**
   * Calculate TTL in seconds until a specific time today
   */
  static ttlUntilTime(timeString: string): number {
    const targetMoment = this.todayAtTime(timeString);
    return targetMoment.diff(this.now(), 'second');
  }

  /**
   * Calculate TTL in seconds until end of day
   */
  static ttlUntilEndOfDay(): number {
    return this.now().endOf('day').diff(this.now(), 'second');
  }

  /**
   * Format a moment for logging with timezone info
   */
  static formatForLogging(moment: dayjs.Dayjs): string {
    return `${moment.format('YYYY-MM-DD HH:mm:ss')} (${moment.format('Z')})`;
  }

  /**
   * Get the previous day of week in lowercase (e.g., 'sunday', 'monday')
   */
  static previousDayOfWeek(): string {
    return this.now().subtract(1, 'day').format('dddd').toLowerCase();
  }

  /**
   * Check if currentMinutes falls within [startMinutes, endMinutes).
   * Handles cross-midnight ranges where endMinutes < startMinutes.
   */
  static isTimeInRange(
    startMinutes: number,
    endMinutes: number,
    currentMinutes: number,
  ): boolean {
    if (endMinutes <= startMinutes) {
      // Cross-midnight: live when on or after start OR before end
      return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    }
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }

  /**
   * Check if current time is within a time range today.
   * Handles cross-midnight ranges (e.g. startTime='23:00', endTime='00:30').
   */
  static isWithinTimeRange(startTime: string, endTime: string): boolean {
    const currentMinutes = this.currentTimeInMinutes();
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    return this.isTimeInRange(sh * 60 + sm, eh * 60 + em, currentMinutes);
  }

  /**
   * Get timezone string used by the application
   */
  static getTimezone(): string {
    return this.ARGENTINA_TIMEZONE;
  }
}
