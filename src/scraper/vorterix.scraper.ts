import axios from 'axios';
import * as cheerio from 'cheerio';

export async function scrapeVorterixSchedule() {
  const res = await axios.get('https://www.vorterix.com/programacion');
  const $ = cheerio.load(res.data);

  const data: any[] = [];

  $('.programacion .programa').each((_, el) => {
    const name = $(el).find('.titulo').text().trim();
    const time = $(el).find('.hora').text().trim(); // ej: 08:00 a 10:00
    const [start_time, end_time] = time.split(' a ').map(t => t.trim());

    const days = $(el).find('.dias').text().toLowerCase(); // ej: lunes a viernes

    const mappedDays = mapDaysToWeekdays(days);

    mappedDays.forEach(day => {
      data.push({
        name,
        start_time,
        end_time,
        day_of_week: day,
      });
    });
  });

  return data;
}

function mapDaysToWeekdays(text: string): string[] {
  if (text.includes('lunes a viernes')) return ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
  if (text.includes('lunes')) return ['monday'];
  if (text.includes('martes')) return ['tuesday'];
  if (text.includes('miércoles') || text.includes('miercoles')) return ['wednesday'];
  if (text.includes('jueves')) return ['thursday'];
  if (text.includes('viernes')) return ['friday'];
  if (text.includes('sábado')) return ['saturday'];
  if (text.includes('domingo')) return ['sunday'];
  return [];
}