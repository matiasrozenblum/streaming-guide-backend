// src/utils/puppeteer.util.ts
import puppeteer from 'puppeteer';

export async function getBrowser() {
  const env = process.env.NODE_ENV || 'development';

  console.log(`🚀 Launching puppeteer in ${env.toUpperCase()} mode`);

  return puppeteer.launch({
    headless: true, // importante para puppeteer 24+
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--window-size=1920x1080',
    ],
  });
}
