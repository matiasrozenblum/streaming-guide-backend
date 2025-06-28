import { WeeklyReportData } from './weekly-report.service';
import { getBrowser } from '../utils/puppeteer.util';
import { themeColors } from './chart.util';
import * as dayjs from 'dayjs';

export async function generateWeeklyReportPdf({
  data,
  charts,
}: {
  data: WeeklyReportData;
  charts: Record<string, string>;
}): Promise<Buffer> {
  const html = `
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; margin: 40px; background: ${themeColors.background}; color: ${themeColors.text}; }
          h1, h2, h3 { color: ${themeColors.primary}; }
          .logo { height: 48px; margin-bottom: 24px; }
          .section { margin-bottom: 40px; }
          .chart-img { width: 600px; max-width: 100%; margin: 16px 0; border-radius: 8px; box-shadow: 0 2px 8px #0001; }
          table { border-collapse: collapse; width: 100%; margin-top: 16px; }
          th, td { border: 1px solid #e2e8f0; padding: 8px 12px; text-align: left; }
          th { background: ${themeColors.primary}; color: #fff; }
          tr:nth-child(even) { background: #f8fafc; }
        </style>
      </head>
      <body>
        <img src="https://laguiadelstreaming.com/img/logo.png" class="logo" alt="Logo" />
        <h1>Reporte Semanal Unificado</h1>
        <div class="section">
          <h2>Resumen General</h2>
          <p><b>Período:</b> ${data.from} a ${data.to}</p>
          <ul>
            <li><b>Usuarios nuevos:</b> ${data.totalNewUsers}</li>
            <li><b>Suscripciones nuevas:</b> ${data.totalNewSubscriptions}</li>
          </ul>
        </div>
        <div class="section">
          <h2>Usuarios Nuevos por Género</h2>
          <img class="chart-img" src="data:image/png;base64,${charts.usersByGender}" />
        </div>
        <div class="section">
          <h2>Suscripciones Nuevas</h2>
          <h3>Por Género</h3>
          <img class="chart-img" src="data:image/png;base64,${charts.subsByGender}" />
          <h3>Por Grupo de Edad</h3>
          <img class="chart-img" src="data:image/png;base64,${charts.subsByAge}" />
        </div>
        <div class="section">
          <h2>Top 5 Canales por Suscripciones</h2>
          <img class="chart-img" src="data:image/png;base64,${charts.topChannelsBySubs}" />
        </div>
        <div class="section">
          <h2>Top 5 Canales por Clicks en YouTube (En Vivo)</h2>
          <img class="chart-img" src="data:image/png;base64,${charts.topChannelsByClicksLive}" />
        </div>
        <div class="section">
          <h2>Top 5 Canales por Clicks en YouTube (Diferido)</h2>
          <img class="chart-img" src="data:image/png;base64,${charts.topChannelsByClicksDeferred}" />
        </div>
        <div class="section">
          <h2>Top 5 Programas por Suscripciones</h2>
          <img class="chart-img" src="data:image/png;base64,${charts.topProgramsBySubs}" />
        </div>
        <div class="section">
          <h2>Top 5 Programas por Clicks en YouTube (En Vivo)</h2>
          <img class="chart-img" src="data:image/png;base64,${charts.topProgramsByClicksLive}" />
        </div>
        <div class="section">
          <h2>Top 5 Programas por Clicks en YouTube (Diferido)</h2>
          <img class="chart-img" src="data:image/png;base64,${charts.topProgramsByClicksDeferred}" />
        </div>
      </body>
    </html>
  `;
  const browser = await getBrowser();
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });
  const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
  await browser.close();
  return Buffer.isBuffer(pdfBuffer) ? pdfBuffer : Buffer.from(pdfBuffer);
}
 