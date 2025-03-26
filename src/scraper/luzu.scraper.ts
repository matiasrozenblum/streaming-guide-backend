const chromium = require('chrome-aws-lambda');
const puppeteer = require('puppeteer-core');

export async function scrapeLuzuSchedule() {
    const isProduction = process.env.AWS_REGION || process.env.NODE_ENV === 'production';

    const browser = await puppeteer.launch({
      headless: true,
      args: isProduction ? chromium.args : [],
      executablePath: isProduction
        ? await chromium.executablePath
        : '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    });

  const page = await browser.newPage();
  await page.goto('https://luzutv.com.ar/', { waitUntil: 'networkidle0' });
  const html = await page.content();
  console.log('🧪 HTML CONTENT:\n', html.slice(0, 1000));
  await page.waitForTimeout(5000);

  const data = await page.evaluate(() => {
    const blocks = Array.from(document.querySelectorAll('.program'));
    return blocks.map((el) => {
      const title = el.querySelector('.program__title')?.textContent?.trim() || '';
      const hour = el.querySelector('.program__hour')?.textContent?.trim() || '';
      const [start_time, end_time] = hour.split(' - ');
      return {
        name: title,
        start_time,
        end_time,
      };
    });
  });

  await browser.close();
  return data;
}