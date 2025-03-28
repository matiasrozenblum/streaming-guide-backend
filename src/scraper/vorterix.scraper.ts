import axios from 'axios';
import * as cheerio from 'cheerio';

export interface VorterixProgram {
  name: string;
  days: string[]; // Ej: ["LUNES", "MIÉRCOLES"]
  startTime: string; // "HH:mm"
  endTime: string;   // "HH:mm"
}

export async function scrapeVorterixSchedule(): Promise<VorterixProgram[]> {
  const url = 'https://www.vorterix.com/programacion';
  const { data: html } = await axios.get(url);
  const $ = cheerio.load(html);
  const result: VorterixProgram[] = [];

  $('.programa').each((_, el) => {
    const name = $(el).find('.nombre').text().trim();
    const horario = $(el).find('.hora').text().trim(); // Ej: "09:00 a 11:00"
    const diasRaw = $(el).find('.dias').text().trim(); // Ej: "LUNES A VIERNES" o "LUNES / MIÉRCOLES / VIERNES"

    const [startTime, endTime] = horario.split(' a ').map(s => s.trim());

    let days: string[] = [];
    if (diasRaw.includes('A')) {
      // Ej: "LUNES A VIERNES"
      const diasOrden = ['LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO', 'DOMINGO'];
      const [startDay, endDay] = diasRaw.split(' A ').map(d => d.trim());
      const startIndex = diasOrden.indexOf(startDay);
      const endIndex = diasOrden.indexOf(endDay);
      if (startIndex !== -1 && endIndex !== -1) {
        days = diasOrden.slice(startIndex, endIndex + 1);
      }
    } else if (diasRaw.includes('/')) {
      // Ej: "LUNES / MIÉRCOLES / VIERNES"
      days = diasRaw.split('/').map(d => d.trim());
    } else {
      // Ej: "DOMINGO"
      days = [diasRaw.trim()];
    }

    result.push({
      name,
      days,
      startTime,
      endTime,
    });
  });

  return result;
}