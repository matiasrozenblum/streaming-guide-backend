import puppeteer from 'puppeteer';

export interface VorterixProgram {
  name: string;
  days: string[]; // Ej: ["LUNES", "MIÉRCOLES"]
  startTime: string; // "HH:mm"
  endTime: string;   // "HH:mm"
}

export async function scrapeVorterixSchedule(): Promise<VorterixProgram[]> {
  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: null,
  });

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
  const grouped = data.reduce((acc, curr) => {
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