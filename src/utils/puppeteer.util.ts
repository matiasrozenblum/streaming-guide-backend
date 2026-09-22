// src/utils/puppeteer.util.ts
import puppeteer, { Browser } from 'puppeteer';

export async function getBrowser() {
  const env = process.env.NODE_ENV || 'development';

  console.log(`🚀 Launching puppeteer in ${env.toUpperCase()} mode`);

  return puppeteer.launch({
    headless: true, // importante para puppeteer 24+
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
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

/**
 * Cierra el browser sin dejar que un fallo al cerrar tape el error original.
 *
 * Va siempre en un `finally`: si el scraping tira a mitad de camino (un selector
 * que el sitio dejo de exponer, un timeout de navegacion), el proceso de Chromium
 * queda vivo hasta que muera el proceso Node. No cuenta para el heap de V8 ni
 * para `process.memoryUsage().rss` — es un proceso hijo — pero si para la memoria
 * del contenedor, que es la que factura y grafica Railway.
 *
 * `close()` puede fallar por si mismo (el proceso ya murio, el socket del
 * DevTools se corto). Si eso pasa dentro de un `finally` sin proteger, la
 * excepcion de cierre reemplaza a la que venia del scraper y perdemos la causa
 * real, asi que se loguea y se sigue.
 */
export async function closeBrowserQuietly(browser: Browser): Promise<void> {
  try {
    await browser.close();
  } catch (error) {
    console.error('⚠️ Error al cerrar el browser de puppeteer:', error);
  }
}
