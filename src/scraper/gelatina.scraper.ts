import { getBrowser } from '@/utils/puppeteer.util';

export interface GelatinaProgram {
  name: string;
  days: string[];
  startTime: string;
  endTime: string;
  panelists?: string[];
  logoUrl?: string;
}

export async function scrapeGelatinaSchedule(): Promise<GelatinaProgram[]> {
  const browser = await getBrowser();
  const page = await browser.newPage();

  await page.goto('https://gelatina.com.ar/contenidos/', {
    waitUntil: 'networkidle2',
    timeout: 60000,
  });

  await page.waitForSelector('.et_pb_row.et_pb_equal_columns', { timeout: 10000 });

  const data = await page.evaluate(() => {
    const results: GelatinaProgram[] = [];
    const programRows = document.querySelectorAll('.et_pb_row');

    const formatTime = (input: string) => {
      const clean = input.replace(/[^\d:]/g, '');
      return clean.includes(':') ? clean : `${clean}:00`;
    };

    programRows.forEach((row, index) => {
      if (index !== 1 && index % 2 === 0 || index > 13) return;

      const logoElement = row.firstElementChild;
      const detailsElement = row.children[1];
      const logoUrl = logoElement?.querySelector('img')?.src;
      const details = detailsElement?.textContent?.trim();
      if (!details || !details.includes('\n')) return;

      const lines = details.split('\n').map((line) => line.trim());
      if (lines.length < 3) {
        if (index === 1) {
          lines[1] = 'Matías Colombatti';
          lines[2] = 'Lunes a Jueves de 10 a 12 h';
        } else if (index === 13) {
          lines[1] = 'Sugus Leunda, Iván Scarpati y Federico Mochi';
          lines[2] = 'Viernes de 13 a 15 h';
        }
      }

      if (lines[2].toLowerCase().includes('lunes a jueves')) {
        lines[2] = lines[2].toLowerCase().replace('lunes a jueves', 'Lunes, Martes, Miercoles, Jueves');
      }

      const [nameRaw, panelistsRaw, scheduleRaw] = lines;
      const panelists = panelistsRaw?.split(',').map((p) => p.trim()) || [];
      const [daysRaw, timeRaw] = scheduleRaw.split(' de ');
      const days = daysRaw.split(', ').map((d) => d.trim().toLowerCase());
      const [startTimeRaw, endTimeRaw] = timeRaw.split(' a ').map((t) => t.trim());

      const startTime = formatTime(startTimeRaw);
      const endTime = formatTime(endTimeRaw);
      const name = nameRaw.replace(/ *\([^)]*\) */g, '').trim();

      results.push({
        name,
        days,
        startTime,
        endTime,
        panelists,
        logoUrl,
      });
    });

    return { results, logs: [] };
  });

  await browser.close();
  return data.results;
}
