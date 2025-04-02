"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scrapeUrbanaPlaySchedule = scrapeUrbanaPlaySchedule;
const puppeteer_1 = require("puppeteer");
async function scrapeUrbanaPlaySchedule() {
    const browser = await puppeteer_1.default.launch({
        headless: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        defaultViewport: null,
    });
    const page = await browser.newPage();
    await page.goto('https://urbanaplayfm.com/programacion/', {
        waitUntil: 'networkidle0',
        timeout: 60000,
    });
    console.log('🕐 Esperando a que la tabla tt_timetable esté presente...');
    await page.waitForSelector('table.tt_timetable', { timeout: 15000 });
    console.log('✅ Tabla detectada. Ejecutando evaluate...');
    const results = await page.evaluate(() => {
        const logs = [];
        logs.push('🌐 ¡Entramos al evaluate!');
        const table = document.querySelector('table.tt_timetable');
        if (!table) {
            console.warn('❌ No se encontró la tabla');
            return { programs: [], logs };
        }
        const dayHeaders = Array.from(table.querySelectorAll('thead th')).slice(1);
        logs.push(`🗓️ Días encontrados: ${dayHeaders.length}`);
        const days = dayHeaders.map((th) => th.textContent?.trim().toLowerCase() || 'desconocido');
        const programs = [];
        const rows = Array.from(table.querySelectorAll('tbody tr'));
        logs.push(`📋 Filas de programas encontradas: ${rows.length}`);
        rows.forEach((row) => {
            const cells = Array.from(row.querySelectorAll('td'));
            logs.push(`📋 Celdas encontradas en fila: ${cells.length}`);
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
    console.log('📺 Programas encontrados:');
    results.programs.forEach((program, i) => {
        console.log(`\n#${i + 1}`);
        console.log('Nombre:', program.name);
        console.log('Horario:', `${program.startTime} - ${program.endTime}`);
        console.log('Panelistas:', program.panelists);
        console.log('Días:', program.days);
    });
    console.log(results.logs);
    await browser.close();
    return results.programs;
}
//# sourceMappingURL=urbana.scraper.js.map