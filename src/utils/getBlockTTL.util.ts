import { Schedule } from "@/schedules/schedules.entity";
import * as dayjs from 'dayjs';
import * as utc from 'dayjs/plugin/utc';
import * as timezone from 'dayjs/plugin/timezone';
import { convertTimeToMinutes } from "./convertTimeToMinutes.util";

dayjs.extend(utc);
dayjs.extend(timezone);

export function getEndOfDayTTL(): number {
    const now = dayjs().tz('America/Argentina/Buenos_Aires');
    return now.endOf('day').diff(now, 'second');
  }

export async function getCurrentBlockTTL(channelId: string, schedules: Schedule[]): Promise<number> {
    const now = dayjs().tz('America/Argentina/Buenos_Aires');
    // Filtrar sólo del canal
    const channelSched = schedules
      .filter(s => s.program.channel?.youtube_channel_id === channelId)
      .map(s => ({
        start: convertTimeToMinutes(s.start_time),
        end: convertTimeToMinutes(s.end_time),
      }))
      .sort((a, b) => a.start - b.start);

    // Detectar el bloque que contiene el minuto actual (gap <2 min)
    let blockEnd: number | null = null;
    let prevEnd: number | null = null;
    for (const seg of channelSched) {
      if (seg.start <= now.hour() * 60 + now.minute() && seg.end > now.hour() * 60 + now.minute()) {
        // incia bloque con este segmento
        prevEnd = seg.end;
        blockEnd = seg.end;
        continue;
      }
      if (prevEnd !== null && seg.start - prevEnd < 2) {
        // extiende bloque
        blockEnd = seg.end;
        prevEnd = seg.end;
        continue;
      }
      // si bloque ya detectado y sin extender, salimos
      if (blockEnd !== null) break;
    }
    if (!blockEnd) {
      // fallback: hasta fin del día
      return getEndOfDayTTL();
    }
    // calcular segundos hasta blockEnd
    const endMoment = now.startOf('day').add(blockEnd, 'minute');
    return endMoment.diff(now, 'second');
}