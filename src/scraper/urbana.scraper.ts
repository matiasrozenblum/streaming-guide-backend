import { getBrowser } from '@/utils/puppeteer.util';

export interface UrbanaProgram {
  name: string;
  days: string[];
  startTime: string;
  endTime: string;
  panelists?: string[];
  logoUrl?: string | null;
}

export async function scrapeUrbanaPlaySchedule(): Promise<UrbanaProgram[]> {
  const browser = await getBrowser();
  const page = await browser.newPage();

  await page.goto('https://urbanaplayfm.com/programacion/', {
    waitUntil: 'networkidle0',
    timeout: 60000,
  });

  await page.waitForSelector('table.tt_timetable', { timeout: 15000 });

  const results: { programs: any[]; logs: string[] } = await page.evaluate(() => {
    const logs: string[] = [];
    const table = document.querySelector('table.tt_timetable');
    if (!table) return { programs: [], logs };

    const dayHeaders = Array.from(table.querySelectorAll('thead th')).slice(1);
    const days = dayHeaders.map((th) => th.textContent?.trim().toLowerCase() || 'desconocido');

    const programs: any[] = [];
    const rows = Array.from(table.querySelectorAll('tbody tr'));

    rows.forEach((row) => {
      const cells = Array.from(row.querySelectorAll('td'));
      let dayIndex = 0;

      cells.forEach((cell) => {
        const name = cell.querySelector('.event_header')?.textContent?.trim();
        const time = cell.querySelector('.hours_container')?.textContent?.trim();
        const panelistsRaw = cell.querySelector('.before_hour_text')?.textContent?.trim();
        const colspan = parseInt(cell.getAttribute('colspan') || '1', 10);

        if (name && time) {
          const [startTime, endTime] = time.split(' - ').map((t) => t.trim());
          const panelists = panelistsRaw ? panelistsRaw.split(',').map((p) => p.trim()) : [];
          const applicableDays = days.slice(dayIndex, dayIndex + colspan);

          programs.push({
            name,
            startTime,
            endTime,
            panelists,
            days: applicableDays,
          });
        }

        dayIndex += colspan;
      });
    });

    return { programs, logs };
  });

  await browser.close();

  return results.programs;
}
