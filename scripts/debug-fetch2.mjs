import { chromium } from 'playwright';

const url = 'https://news.google.com/rss/articles/CBMiWEFVX3lxTFBVX3dScWFqQ2ZoVERUOFlzNmF4UDhqdERfMml0eDN0Q2h1ZFJVY1hORzRhSTExYXd0S0RuVUxsS1ZYMFNKTEhneFVmRUZ4TW16bUI1SmwtMmE?oc=5';

const browser = await chromium.launch();

// Attempt 1: no consent cookie, default context
{
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'load', timeout: 20000 }).catch((e) => console.log('goto1 err', e.message));
  await page.waitForTimeout(5000);
  console.log('ATTEMPT1 URL:', page.url());
  console.log('ATTEMPT1 TITLE:', await page.title());
  const bodyText1 = await page.evaluate(() => document.body.innerText.slice(0, 500)).catch(() => '');
  console.log('ATTEMPT1 BODY SNIPPET:', bodyText1);
  await page.screenshot({ path: 'debug-shot.png' }).catch(() => {});
  await context.close();
}

// Attempt 2: pre-set Google consent cookie to skip the "before you continue" dialog
{
  const context = await browser.newContext();
  await context.addCookies([
    {
      name: 'CONSENT',
      value: 'YES+cb.20220419-08-p0.en+FX+410',
      domain: '.google.com',
      path: '/',
    },
    {
      name: 'CONSENT',
      value: 'YES+cb.20220419-08-p0.en+FX+410',
      domain: 'news.google.com',
      path: '/',
    },
  ]);
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'load', timeout: 20000 }).catch((e) => console.log('goto2 err', e.message));
  await page.waitForTimeout(5000);
  console.log('ATTEMPT2 URL:', page.url());
  console.log('ATTEMPT2 TITLE:', await page.title());
  const bodyText2 = await page.evaluate(() => document.body.innerText.slice(0, 500)).catch(() => '');
  console.log('ATTEMPT2 BODY SNIPPET:', bodyText2);
  await context.close();
}

await browser.close();
