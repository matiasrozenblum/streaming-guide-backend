"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scrapeVorterixSchedule = scrapeVorterixSchedule;
const puppeteer_1 = require("puppeteer");
const dayOrder = ['LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO', 'DOMINGO'];
function getNextDay(day) {
    const index = dayOrder.indexOf(day.toUpperCase());
    if (index === -1)
        return day;
    return dayOrder[(index + 1) % 7];
}
function toMinutes(time) {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
}
async function scrapeVorterixSchedule() {
    const browser = await puppeteer_1.default.launch({
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
    const data = await page.$$eval('.mb-2.md\\:flex-1.md\\:min-w-\\[200px\\]', (columns) => {
        const results = [];
        columns.forEach((column) => {
            const dayBlock = column.querySelector('.title.bg-primary');
            const dayName = dayBlock?.querySelector('h2')?.textContent?.trim().toUpperCase() || '';
            const programs = column.querySelectorAll('.showP');
            programs.forEach((block) => {
                const name = block.querySelector('h3')?.textContent?.trim() || '';
                const horarioRaw = block.querySelector('h4')?.textContent?.trim() || '';
                if (!name || !horarioRaw.includes('-'))
                    return;
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
    });
    await browser.close();
    const normalized = [];
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
        }
        else {
            normalized.push(item);
        }
    }
    const grouped = normalized.reduce((acc, curr) => {
        const key = `${curr.name}_${curr.startTime}_${curr.endTime}`;
        if (!acc[key]) {
            acc[key] = { ...curr };
        }
        else {
            acc[key].days.push(...curr.days);
        }
        return acc;
    }, {});
    return Object.values(grouped);
}
//# sourceMappingURL=vorterix.scraper.js.map