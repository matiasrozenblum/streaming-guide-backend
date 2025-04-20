import puppeteer from 'puppeteer';

export async function getBrowser() {
  const env = process.env.NODE_ENV || 'development';

  if (env === 'production' || env === 'staging') {
    console.log(`🚀 Launching puppeteer in ${env.toUpperCase()} mode`);
    return await puppeteer.launch({
      headless: true, // 👈 clásico headless
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--no-zygote',
        '--single-process',
        '--window-size=1920x1080',
      ],
      protocolTimeout: 60000, // 👈 para evitar timeouts
      pipe: true,             // 👈 recomendado en servidores
      dumpio: true,            // 👈 para que puedas ver errores de Chrome en Railway
    });
  }

  console.log('🚀 Launching puppeteer in DEVELOPMENT mode');
  return await puppeteer.launch({
    headless: false,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: [],
  });
}
