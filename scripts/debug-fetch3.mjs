import { chromium } from 'playwright';

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
    },
    redirect: 'follow',
  });
  return { text: await res.text(), finalUrl: res.url };
}

// Fetch a FRESH RSS feed right now, and use the first item's link immediately
// (Google News article tokens may be short-lived / session-bound).
const rssUrl = 'https://news.google.com/rss/search?q=' + encodeURIComponent('바우처 when:7d') + '&hl=ko&gl=KR&ceid=KR:ko';
const { text } = await fetchText(rssUrl);
const firstItem = text.match(/<item>([\s\S]*?)<\/item>/)[1];
const link = firstItem.match(/<link>([\s\S]*?)<\/link>/)[1].trim();
const title = firstItem.match(/<title>([\s\S]*?)<\/title>/)[1].trim();
console.log('FRESH TITLE:', title);
console.log('FRESH LINK:', link);

const browser = await chromium.launch();
const context = await browser.newContext({
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
});
await context.addCookies([
  { name: 'CONSENT', value: 'YES+cb.20220419-08-p0.en+FX+410', domain: '.google.com', path: '/' },
]);
const page = await context.newPage();

await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch((e) => console.log('goto err', e.message));
console.log('T+0s URL:', page.url());
console.log('T+0s TITLE:', await page.title());
console.log('T+0s BODY:', (await page.evaluate(() => document.body.innerText).catch(() => '')).slice(0, 300));

await page.waitForTimeout(3000);
console.log('T+3s URL:', page.url());

await page.waitForTimeout(5000);
console.log('T+8s URL:', page.url());
console.log('T+8s BODY:', (await page.evaluate(() => document.body.innerText).catch(() => '')).slice(0, 300));

await browser.close();
