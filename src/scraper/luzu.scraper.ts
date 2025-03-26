import chromium from 'chrome-aws-lambda';
import puppeteer from 'puppeteer-core';

export async function scrapeLuzuSchedule() {
  const executablePath = await chromium.executablePath;

  const browser = await puppeteer.launch({
    args: chromium.args,
    executablePath,
    headless: chromium.headless,
  });

  const page = await browser.newPage();
  await page.goto('https://luzutv.com.ar/', { waitUntil: 'networkidle0' });

  await page.waitForSelector('.program__title');

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