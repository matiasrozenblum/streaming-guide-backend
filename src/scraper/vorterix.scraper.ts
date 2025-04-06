import { getBrowser } from '@/utils/puppeteer.util';
import { Page } from 'puppeteer-core';

export interface VorterixProgram {
  name: string;
  days: string[];
  startTime: string;
  endTime: string;
}

const dayOrder = ['LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO', 'DOMINGO'];

function getNextDay(day: string): string {
  const index = dayOrder.indexOf(day.toUpperCase());
  return index === -1 ? day : dayOrder[(index + 1) % 7];
}

function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export async function scrapeVorterixSchedule(): Promise<VorterixProgram[]> {
  const browser = await getBrowser();
  const page = await browser.newPage();

  await page.goto('https://www.vorterix.com/programacion', {
    waitUntil: 'networkidle2',
    timeout: 60000,
  });

  await page.waitForSelector('.showP', { timeout: 15000 });

  const data = await page.$$eval(
    '.mb-2.md\\:flex-1.md\\:min-w-\\[200px\\]',
    (columns) => {
      const results: { name: string; startTime: string; endTime: string; days: string[] }[] = [];

      columns.forEach((column) => {
        const dayBlock = column.querySelector('.title.bg-primary');
        const dayName = dayBlock?.querySelector('h2')?.textContent?.trim().toUpperCase() || '';
        const programs = column.querySelectorAll('.showP');

        programs.forEach((block) => {
          const name = block.querySelector('h3')?.textContent?.trim() || '';
          const horarioRaw = block.querySelector('h4')?.textContent?.trim() || '';

          if (!name || !horarioRaw.includes('-')) return;

          const [startTime, endTime] = horarioRaw.split('-').map((s) => s.trim());

          results.push({
            name,
            startTime,
            endTime,
            days: [dayName],
          });
        });
      });

      return results;
    }
  );

  await browser.close();

  // Normalización
  const normalized: VorterixProgram[] = [];

  for (const item of data) {
    const startMin = toMinutes(item.startTime);
    const endMin = toMinutes(item.endTime);

    if (endMin <= startMin) {
      for (const day of item.days) {
        normalized.push({
          name: item.name,
          startTime: item.startTime,
          endTime: '23:59',
          days: [day],
        });
        normalized.push({
          name: item.name,
          startTime: '00:00',
          endTime: item.endTime,
          days: [getNextDay(day)],
        });
      }
    } else {
      normalized.push(item);
    }
  }

  const grouped = normalized.reduce((acc, curr) => {
    const key = `${curr.name}_${curr.startTime}_${curr.endTime}`;
    if (!acc[key]) {
      acc[key] = { ...curr };
    } else {
      acc[key].days.push(...curr.days);
    }
    return acc;
  }, {} as Record<string, VorterixProgram>);

  return Object.values(grouped);
}
