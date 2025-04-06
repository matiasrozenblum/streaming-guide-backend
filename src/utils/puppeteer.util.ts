// src/utils/puppeteer.util.ts
import { launch, LaunchOptions } from 'puppeteer-core';
import chrome from 'chrome-aws-lambda';

export async function getBrowser() {
  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction) {
    const executablePath = await chrome.executablePath;
    console.log('🚀 Launching puppeteer in PRODUCTION mode.');
    console.log('📍 Executable path:', executablePath);

    const options: LaunchOptions & { ignoreHTTPSErrors: boolean } = {
      args: chrome.args,
      executablePath,
      headless: chrome.headless,
      ignoreHTTPSErrors: true,
    };

    return await launch(options);
  }

  const devExecutablePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  console.log('🚀 Launching puppeteer in DEVELOPMENT mode.');
  console.log('📍 Executable path:', devExecutablePath);
  
  return await launch({
    headless: false,
    executablePath: devExecutablePath,
    args: [],
  });
}
