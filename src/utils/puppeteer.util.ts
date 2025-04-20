import puppeteer from 'puppeteer-core'; // 👈 ojo, puppeteer-core en vez de puppeteer
import chromium from 'chrome-aws-lambda'; // 👈 importá esto

export async function getBrowser() {
  const env = process.env.NODE_ENV || 'development';

  if (env === 'production' || env === 'staging') {
    console.log(`🚀 Launching puppeteer in ${env.toUpperCase()} mode`);
    return await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath, // 👈 usá el Chrome portable
      headless: chromium.headless,
      defaultViewport: chromium.defaultViewport,
      ignoreHTTPSErrors: true,
    });
  }

  console.log('🚀 Launching puppeteer in DEVELOPMENT mode');
  return await puppeteer.launch({
    headless: false,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: [],
  });
}
