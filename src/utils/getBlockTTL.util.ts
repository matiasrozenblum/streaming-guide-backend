import { Schedule } from '@/schedules/schedules.entity';
import * as dayjs from 'dayjs';
import * as utc from 'dayjs/plugin/utc';
import * as timezone from 'dayjs/plugin/timezone';
import { convertTimeToMinutes } from './convertTimeToMinutes.util';
import { SentryService } from '../sentry/sentry.service';
import { TimezoneUtil } from './timezone.util';

// Simple in-memory cache to prevent duplicate alerts for the same channel within a short time window
const alertCache = new Map<string, number>();
const ALERT_COOLDOWN = 5 * 60 * 1000; // 5 minutes cooldown between alerts for the same channel

dayjs.extend(utc);
dayjs.extend(timezone);

export function getEndOfDayTTL(): number {
  return TimezoneUtil.ttlUntilEndOfDay();
}

export async function getCurrentBlockTTL(
  channelId: string,
  schedules: Schedule[],
  sentryService?: SentryService,
): Promise<number> {
  // Use centralized timezone utility for consistency
  const now = TimezoneUtil.now();
  const currentTimeInMinutes = TimezoneUtil.currentTimeInMinutes();

  // Filtrar sólo del canal
  const channelSched = schedules
    .filter((s) => s.program.channel?.youtube_channel_id === channelId)
    .map((s) => ({
      start: convertTimeToMinutes(s.start_time),
      end: convertTimeToMinutes(s.end_time),
      programName: s.program.name,
      startTime: s.start_time,
      endTime: s.end_time,
    }))
    .sort((a, b) => a.start - b.start);

  // Detectar el bloque que contiene el minuto actual (gap <2 min)
  let blockEnd: number | null = null;
  let prevEnd: number | null = null;
  let currentProgram: any = null;

  console.log(
    `🔍 [TTL Debug] Channel ${channelId} - Current time: ${currentTimeInMinutes} minutes (${Math.floor(currentTimeInMinutes / 60)}:${(currentTimeInMinutes % 60).toString().padStart(2, '0')})`,
  );
  console.log(
    `🔍 [TTL Debug] Channel ${channelId} - Available programs:`,
    channelSched.map(
      (s) => `${s.startTime}-${s.endTime} (${s.start}-${s.end} min)`,
    ),
  );

  for (const seg of channelSched) {
    console.log(
      `🔍 [TTL Debug] Checking program ${seg.programName} (${seg.startTime}-${seg.endTime}): ${seg.start} <= ${currentTimeInMinutes} && ${seg.end} > ${currentTimeInMinutes} = ${seg.start <= currentTimeInMinutes && seg.end > currentTimeInMinutes}`,
    );

    if (TimezoneUtil.isTimeInRange(seg.start, seg.end, currentTimeInMinutes)) {
      // incia bloque con este segmento
      prevEnd = seg.end;
      blockEnd = seg.end;
      currentProgram = seg;
      console.log(
        `✅ [TTL Debug] Found current program: ${seg.programName} (${seg.startTime}-${seg.endTime}), blockEnd: ${blockEnd}`,
      );
      continue;
    }
    if (prevEnd !== null && seg.start - prevEnd < 2) {
      // extiende bloque
      blockEnd = seg.end;
      prevEnd = seg.end;
      console.log(
        `🔄 [TTL Debug] Extended block to: ${blockEnd} (${Math.floor(blockEnd / 60)}:${(blockEnd % 60).toString().padStart(2, '0')})`,
      );
      continue;
    }
    // si bloque ya detectado y sin extender, salimos
    if (blockEnd !== null) break;
  }

  if (!blockEnd) {
    // fallback: hasta fin del día
    return getEndOfDayTTL();
  }

  // calcular segundos hasta blockEnd - use centralized timezone utility
  const endTimeString = `${Math.floor(blockEnd / 60)
    .toString()
    .padStart(2, '0')}:${(blockEnd % 60).toString().padStart(2, '0')}`;
  let endMoment = TimezoneUtil.todayAtTime(endTimeString);
  let ttl = endMoment.diff(now, 'second');

  // Cross-midnight fix: if blockEnd (minutes) is before currentTimeInMinutes, the end time
  // belongs to tomorrow (e.g. program runs 23:00–00:30 and it's currently 23:22).
  if (ttl < 0 && blockEnd < currentTimeInMinutes) {
    endMoment = endMoment.add(1, 'day');
    ttl = endMoment.diff(now, 'second');
  }

  console.log(
    `🔍 [TTL Debug] Channel ${channelId} - Final calculation: blockEnd=${blockEnd} (${Math.floor(blockEnd / 60)}:${(blockEnd % 60).toString().padStart(2, '0')}), TTL=${ttl}s`,
  );

  // Check if TTL is negative (program already ended)
  if (ttl < 0) {
    console.warn(
      `⚠️ Negative TTL detected for channel ${channelId}: ${ttl}s (program ended at ${currentProgram?.endTime || 'unknown'})`,
    );
    console.warn(
      `🔍 Debug info - Current time: ${TimezoneUtil.formatForLogging(now)}, End moment: ${TimezoneUtil.formatForLogging(endMoment)}`,
    );

    // Send alert to Sentry if service is available and not recently alerted for this channel
    if (sentryService) {
      const alertTime = Date.now();
      const lastAlertTime = alertCache.get(channelId);

      if (!lastAlertTime || alertTime - lastAlertTime > ALERT_COOLDOWN) {
        sentryService.captureMessage(
          `Negative TTL calculation detected for channel ${channelId}`,
          'warning',
          {
            service: 'ttl-calculation',
            error_type: 'negative_ttl',
            channelId,
            currentTime: TimezoneUtil.formatForLogging(now),
            currentTimeInMinutes,
            programName: currentProgram?.programName || 'unknown',
            programEndTime: currentProgram?.endTime || 'unknown',
            calculatedTTL: ttl,
            blockEnd,
            schedulesCount: channelSched.length,
            timestamp: new Date().toISOString(),
          },
        );

        sentryService.setTag('service', 'ttl-calculation');
        sentryService.setTag('error_type', 'negative_ttl');
        sentryService.setTag('channel', channelId);

        // Update alert cache
        alertCache.set(channelId, alertTime);
      } else {
        console.log(
          `🔇 Skipping duplicate Sentry alert for channel ${channelId} (cooldown active)`,
        );
      }
    }

    // Return a small positive TTL (60 seconds) to avoid immediate expiration
    return 60;
  }

  return ttl;
}
