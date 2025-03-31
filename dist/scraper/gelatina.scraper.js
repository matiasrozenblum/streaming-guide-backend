"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scrapeGelatinaSchedule = scrapeGelatinaSchedule;
const puppeteer_1 = require("puppeteer");
async function scrapeGelatinaSchedule() {
    const browser = await puppeteer_1.default.launch({
        headless: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        defaultViewport: null,
    });
    const page = await browser.newPage();
    await page.goto('https://gelatina.com.ar/contenidos/', {
        waitUntil: 'networkidle2',
        timeout: 60000,
    });
    await page.waitForSelector('.et_pb_row.et_pb_equal_columns', { timeout: 10000 });
    console.log('Esperando a que los elementos de los programas estén presentes...');
    const data = await page.evaluate(() => {
        const logs = [];
        const results = [];
        const programRows = document.querySelectorAll('.et_pb_row');
        logs.push(`Filas de programas encontradas: ${programRows.length}`);
        const formatTime = (input) => {
            const clean = input.replace(/[^\d:]/g, '');
            if (!clean.includes(':')) {
                return `${clean}:00`;
            }
            return clean;
        };
        programRows.forEach((row, index) => {
            if (index !== 1 && index % 2 === 0 || index > 13)
                return;
            const logoElement = row.firstElementChild;
            const detailsElement = row.children[1];
            const logoUrl = logoElement?.querySelector('img')?.src;
            const details = detailsElement?.textContent?.trim();
            if (!details || !details.includes('\n')) {
                logs.push(`⚠️ Formato inesperado en fila ${index}: ${details}`);
                return;
            }
            const lines = details.split('\n').map((line) => line.trim());
            if (lines.length < 3) {
                logs.push(`⚠️ Faltan líneas en fila ${index}: ${JSON.stringify(lines)}`);
                if (index === 1) {
                    lines[1] = 'Matías Colombatti';
                    lines[2] = 'Lunes a Jueves de 10 a 12 h';
                }
                else if (index === 13) {
                    lines[1] = 'Sugus Leunda, Iván Scarpati y Federico Mochi';
                    lines[2] = 'Viernes de 13 a 15 h';
                }
                logs.push(`⚠️ Líneas corregidas en fila ${index}: ${JSON.stringify(lines)}`);
            }
            logs.push(`linea 2 antes de corregir: ${lines[2]}`);
            if (lines[2].toLowerCase().includes('lunes a jueves')) {
                lines[2] = lines[2].toLowerCase().replace('lunes a jueves', 'Lunes, Martes, Miercoles, Jueves');
            }
            logs.push(`linea 2 después de corregir: ${lines[2]}`);
            const [nameRaw, panelistsRaw, scheduleRaw] = lines;
            const panelists = panelistsRaw?.split(',').map((p) => p.trim()) || [];
            if (!scheduleRaw || !scheduleRaw.includes(' de ') || !scheduleRaw.includes(' a ')) {
                logs.push(`⚠️ Formato de horario inesperado en fila ${index}: ${scheduleRaw}`);
                return;
            }
            logs.push('Todos los datos son válidos para la fila ' + index);
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
        console.log('🧪 LOGS GELATINA:', logs);
        return { results, logs };
    });
    console.log(data.logs);
    await browser.close();
    return data.results;
}
//# sourceMappingURL=gelatina.scraper.js.map