/** Exercise the real authorization UI in a separate, isolated headless browser. */
import fs from 'node:fs';
import path from 'node:path';

import puppeteer from 'puppeteer-core';

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const { authUrl, registry, cookie, browserPath, profileDir } = JSON.parse(Buffer.concat(chunks).toString());
const registryUrl = new URL(registry);
if (
  registryUrl.protocol !== 'http:' ||
  registryUrl.hostname !== '127.0.0.1' ||
  new URL(authUrl).origin !== registryUrl.origin
) {
  throw new Error('CLI browser test requires its isolated loopback registry');
}
const executable = fs.realpathSync(browserPath);
if (path.basename(executable) !== 'chrome-headless-shell' || !executable.includes('/chrome-headless-shell/')) {
  throw new Error('CLI browser test requires a dedicated Chrome Headless Shell');
}

const browser = await puppeteer.launch({
  executablePath: executable,
  headless: 'shell',
  userDataDir: profileDir,
  args: [
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-default-apps',
    '--disable-dev-shm-usage',
    '--no-first-run',
    '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1',
    ...(process.platform === 'linux' ? ['--no-sandbox'] : [])
  ]
});
process.once('SIGTERM', () => {
  void browser.close().finally(() => process.exit(143));
});

try {
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin === registryUrl.origin || url.protocol === 'data:') void request.continue();
    else void request.abort();
  });
  await page.setCookie(
    ...cookie.split('; ').map((part) => {
      const separator = part.indexOf('=');
      if (separator <= 0) throw new Error('Invalid local session cookie');
      return { name: part.slice(0, separator), value: part.slice(separator + 1), url: registry };
    })
  );
  const pageResponse = await page.goto(authUrl, { waitUntil: 'networkidle0', timeout: 20_000 });
  if (pageResponse?.status() !== 200) throw new Error('Authorization page did not load');

  const sessionCode = new URL(authUrl).searchParams.get('session');
  const pageText = await page.evaluate(() => document.body.innerText);
  if (
    !sessionCode ||
    !pageText.includes('The Tank CLI is requesting access to your account.') ||
    !pageText.includes(sessionCode.slice(0, 8))
  ) {
    throw new Error('Authorization page does not match the CLI session');
  }
  const buttons = await page.$$('button');
  let authorizeButton;
  for (const button of buttons) {
    if ((await button.evaluate((element) => element.textContent?.trim())) === 'Authorize') authorizeButton = button;
  }
  if (!authorizeButton) throw new Error('Authorize button was not rendered');
  const authorization = page.waitForResponse(
    (response) => response.url() === `${registry}/api/v1/cli-auth/authorize` && response.request().method() === 'POST',
    { timeout: 10_000 }
  );
  await authorizeButton.click();
  const response = await authorization;
  if (response.status() !== 200) throw new Error(`Authorization request failed: ${response.status()}`);
  await page.waitForFunction(
    () => [...document.querySelectorAll('h3')].some((element) => element.textContent?.trim() === 'Authorized'),
    { timeout: 10_000 }
  );
  process.stdout.write('Browser authorized the CLI session\n');
} finally {
  await browser.close();
}
