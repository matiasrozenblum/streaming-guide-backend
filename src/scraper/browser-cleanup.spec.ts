/**
 * Los tres scrapers cierran Chromium en un `finally`.
 *
 * Antes lo cerraban con un `await browser.close()` suelto como ultima linea del
 * flujo, asi que cualquier excepcion previa — un selector que el sitio dejo de
 * exponer, un timeout de navegacion — dejaba el proceso de Chromium vivo hasta
 * que muriera el proceso Node. Esa memoria no aparece en el heap de V8 ni en
 * `process.memoryUsage().rss` (es un proceso hijo), pero si en la del contenedor.
 */
import { closeBrowserQuietly } from '@/utils/puppeteer.util';

jest.mock('@/utils/puppeteer.util', () => ({
  getBrowser: jest.fn(),
  closeBrowserQuietly: jest.fn(),
}));

// Se importan despues del mock para que tomen la version mockeada del util.
import { getBrowser } from '@/utils/puppeteer.util';
import { scrapeVorterixSchedule } from './vorterix.scraper';
import { scrapeUrbanaPlaySchedule } from './urbana.scraper';
import { scrapeGelatinaSchedule } from './gelatina.scraper';

const mockGetBrowser = getBrowser as jest.Mock;
const mockClose = closeBrowserQuietly as jest.Mock;

/** Browser cuyo `page.goto` falla, simulando un sitio caido o cambiado. */
const browserThatFailsOnGoto = () => {
  const page = {
    goto: jest.fn().mockRejectedValue(new Error('navigation timeout')),
    waitForSelector: jest.fn(),
    evaluate: jest.fn(),
    $$eval: jest.fn(),
    setViewport: jest.fn(),
    close: jest.fn(),
  };
  return { newPage: jest.fn().mockResolvedValue(page), close: jest.fn() };
};

describe('limpieza del browser en los scrapers', () => {
  beforeEach(() => jest.clearAllMocks());

  const scrapers: [string, () => Promise<unknown>][] = [
    ['vorterix', scrapeVorterixSchedule],
    ['urbana', scrapeUrbanaPlaySchedule],
    ['gelatina', scrapeGelatinaSchedule],
  ];

  describe.each(scrapers)('%s', (_name, scrape) => {
    it('cierra el browser cuando el scraping falla', async () => {
      const browser = browserThatFailsOnGoto();
      mockGetBrowser.mockResolvedValue(browser);

      await expect(scrape()).rejects.toThrow('navigation timeout');

      expect(mockClose).toHaveBeenCalledTimes(1);
      expect(mockClose).toHaveBeenCalledWith(browser);
    });
  });
});

describe('closeBrowserQuietly', () => {
  // El modulo esta mockeado arriba, asi que para probar la implementacion real
  // hay que pedir la version sin mock.
  const real = jest.requireActual<typeof import('@/utils/puppeteer.util')>(
    '@/utils/puppeteer.util',
  );

  it('cierra el browser', async () => {
    const browser = { close: jest.fn().mockResolvedValue(undefined) };
    await real.closeBrowserQuietly(browser as any);
    expect(browser.close).toHaveBeenCalledTimes(1);
  });

  // Que se trague el error es lo que garantiza que, cuando el scraping falla,
  // la excepcion que se propaga sea la del scraping y no la del cierre.
  it('se traga el error si el cierre falla', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    const browser = {
      close: jest.fn().mockRejectedValue(new Error('socket cerrado')),
    };

    await expect(
      real.closeBrowserQuietly(browser as any),
    ).resolves.toBeUndefined();
    expect(consoleSpy).toHaveBeenCalled();
  });
});
