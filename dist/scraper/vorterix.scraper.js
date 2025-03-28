"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scrapeVorterixSchedule = scrapeVorterixSchedule;
const puppeteer_1 = require("puppeteer");
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
    const bloques = await page.$$eval('.showP', (els) => els.map((el) => el.innerHTML));
    console.log('🧱 InnerHTML de los bloques .showP:', bloques);
    const data = await page.$$eval('.showP', (programas) => {
        const results = [];
        for (const el of programas) {
            const name = el.querySelector('h3')?.textContent?.trim() || '';
            const horarioRaw = el.querySelector('h4')?.textContent?.trim() || '';
            if (!name || !horarioRaw.includes('-'))
                continue;
            const [startTime, endTime] = horarioRaw
                .split('-')
                .map((s) => s.trim());
            results.push({
                name,
                startTime,
                endTime,
                days: []
            });
        }
        return results;
    });
    await browser.close();
    return data;
}
//# sourceMappingURL=vorterix.scraper.js.map