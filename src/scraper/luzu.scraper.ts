import puppeteer from 'puppeteer';

export async function scrapeLuzuSchedule() {
  const browser = await puppeteer.launch({
    headless: true, // para Puppeteer moderno
  });
  const page = await browser.newPage();
  await page.goto('https://luzutv.com.ar/', { waitUntil: 'networkidle0' });

  // Esperamos que cargue el contenido relevante (ajustar si hace falta)
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // 👇 Logueamos el HTML de la grilla (luego extraemos info real)
  const html = await page.content();

  await browser.close();
  return { html }; // después devolvemos la data procesada
}