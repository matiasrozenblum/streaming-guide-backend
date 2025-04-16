// src/utils/puppeteer.util.ts
import puppeteer from 'puppeteer';

export async function getBrowser() {
  const env = process.env.NODE_ENV || 'development';

  if (env === 'production' || env === 'staging') {
    console.log(`🚀 Launching puppeteer in ${env.toUpperCase()} mode`);
    return await puppeteer.launch({
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920x1080',
      ],
      headless: true,
    });
  }

  console.log('🚀 Launching puppeteer in DEVELOPMENT mode');
  return await puppeteer.launch({
    headless: false,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: [],
  });
}
