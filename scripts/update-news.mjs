import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { chromium } from 'playwright';

const DATA_DIR = path.join(process.cwd(), 'data');
const CURRENT_PATH = path.join(DATA_DIR, 'current-week-data.js');
const ARCHIVE_PATH = path.join(DATA_DIR, 'archive-data.js');

const CATEGORIES = [
  { key: 'welfare', query: '복지포인트 OR 바우처' },
  { key: 'payment', query: '간편결제 OR 멤버십' },
  { key: 'insurance', query: 'GA 보험대리점' },
  { key: 'aicc', query: 'AICC OR AI 컨택센터' },
  { key: 'safety', query: '산업안전 안전보건' },
];

const MAX_PER_CATEGORY = 5;
const EXCLUDE_SOURCE_SUBSTR = ['MSN'];
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36';

function loadWindowVar(filePath, varName) {
  const code = fs.readFileSync(filePath, 'utf8');
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return sandbox.window[varName];
}

function decodeEntities(str) {
  if (!str) return str;
  return str
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function stripTags(str) {
  return decodeEntities(str.replace(/<[^>]*>/g, '')).trim();
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA },
    redirect: 'follow',
  });
  return { text: await res.text(), finalUrl: res.url };
}

function formatDate(pubDate) {
  const d = new Date(pubDate);
  if (Number.isNaN(d.getTime())) return null;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// Google News RSS <link> values point at a news.google.com SPA shell that performs
// a client-side (JS) redirect to the real publisher URL. A plain HTTP fetch can't
// follow that, so a headless browser is used just to resolve the final URL.
async function resolveGoogleNewsUrl(browser, googleUrl) {
  const page = await browser.newPage({ userAgent: UA });
  try {
    await page.goto(googleUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page
      .waitForFunction(() => !location.hostname.includes('news.google.com'), { timeout: 12000 })
      .catch(() => {});
    const finalUrl = page.url();
    if (finalUrl.includes('news.google.com')) return null;
    return finalUrl;
  } catch {
    return null;
  } finally {
    await page.close();
  }
}

async function fetchCategoryArticles(browser, category) {
  const q = encodeURIComponent(`${category.query} when:7d`);
  const rssUrl = `https://news.google.com/rss/search?q=${q}&hl=ko&gl=KR&ceid=KR:ko`;
  const { text } = await fetchText(rssUrl);
  const items = [...text.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]);

  const results = [];
  for (const item of items) {
    if (results.length >= MAX_PER_CATEGORY) break;

    const titleMatch = item.match(/<title>([\s\S]*?)<\/title>/);
    const linkMatch = item.match(/<link>([\s\S]*?)<\/link>/);
    const pubDateMatch = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
    const sourceMatch = item.match(/<source[^>]*>([\s\S]*?)<\/source>/);

    if (!titleMatch || !linkMatch) continue;

    const rawTitle = stripTags(titleMatch[1]);
    const rssLink = stripTags(linkMatch[1]);
    const source = sourceMatch ? stripTags(sourceMatch[1]) : '';
    const date = pubDateMatch ? formatDate(pubDateMatch[1]) : null;

    if (!date) continue;
    if (EXCLUDE_SOURCE_SUBSTR.some((s) => source.toUpperCase().includes(s))) continue;

    let title = rawTitle;
    if (source && title.endsWith(` - ${source}`)) {
      title = title.slice(0, -(source.length + 3));
    }

    const resolvedUrl = await resolveGoogleNewsUrl(browser, rssLink);
    if (!resolvedUrl) continue; // Couldn't resolve to a real publisher URL; skip rather than link to Google's shell.
    if (resolvedUrl.includes('msn.com')) continue;

    let summary = title;
    try {
      const { text: html } = await fetchText(resolvedUrl);
      const ogMatch =
        html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i) ||
        html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:description["']/i);
      const descMatch =
        html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) ||
        html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i);

      const extracted = ogMatch?.[1] || descMatch?.[1];
      if (extracted) {
        summary = decodeEntities(extracted).trim();
      }
    } catch {
      // Article page unreachable/unparseable: fall back to the headline as summary.
    }

    if (summary.length > 160) {
      summary = `${summary.slice(0, 157).trim()}...`;
    }

    results.push({ category: category.key, title, summary, source, date, url: resolvedUrl });
  }
  return results;
}

function getPeriod(now) {
  const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const day = kstNow.getUTCDay();
  const daysSinceMonday = (day + 6) % 7;
  const periodEndDate = new Date(kstNow);
  periodEndDate.setUTCDate(kstNow.getUTCDate() - daysSinceMonday - 1);
  const periodStartDate = new Date(periodEndDate);
  periodStartDate.setUTCDate(periodEndDate.getUTCDate() - 6);

  const fmt = (d) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
      d.getUTCDate(),
    ).padStart(2, '0')}`;
  const fmtLabel = (d) =>
    `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${String(
      d.getUTCDate(),
    ).padStart(2, '0')}`;

  return {
    periodStart: fmt(periodStartDate),
    periodEnd: fmt(periodEndDate),
    periodLabel: `${fmtLabel(periodStartDate)} ~ ${fmtLabel(periodEndDate)}`,
  };
}

async function main() {
  const now = new Date();
  const { periodStart, periodEnd, periodLabel } = getPeriod(now);
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const generatedAt = `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(
    2,
    '0',
  )}-${String(kst.getUTCDate()).padStart(2, '0')}T${String(kst.getUTCHours()).padStart(
    2,
    '0',
  )}:${String(kst.getUTCMinutes()).padStart(2, '0')}:${String(kst.getUTCSeconds()).padStart(
    2,
    '0',
  )}+09:00`;

  const browser = await chromium.launch();
  const allArticles = [];
  try {
    for (const category of CATEGORIES) {
      try {
        const items = await fetchCategoryArticles(browser, category);
        allArticles.push(...items);
      } catch (err) {
        console.error(`Category "${category.key}" failed:`, err.message);
      }
    }
  } finally {
    await browser.close();
  }

  if (allArticles.length === 0) {
    console.error('No articles collected; aborting without touching data files.');
    process.exit(1);
  }

  let archive = [];
  try {
    archive = loadWindowVar(ARCHIVE_PATH, 'ARCHIVE_WEEKS') || [];
  } catch (err) {
    console.error('Could not read existing archive-data.js, starting fresh:', err.message);
  }

  try {
    const outgoing = loadWindowVar(CURRENT_PATH, 'CURRENT_WEEK');
    if (outgoing && Array.isArray(outgoing.articles) && outgoing.articles.length > 0) {
      const realArticles = outgoing.articles.filter((a) => a.url !== '#');
      if (realArticles.length > 0) {
        archive.unshift({
          periodLabel: outgoing.periodLabel,
          periodStart: outgoing.periodStart,
          periodEnd: outgoing.periodEnd,
          articles: realArticles,
        });
      }
    }
  } catch (err) {
    console.error('Could not read existing current-week-data.js:', err.message);
  }

  const currentWeek = { periodLabel, periodStart, periodEnd, generatedAt, articles: allArticles };

  const currentHeader = `/* ==========================================================================
   현재 주차 뉴스 데이터
   이 파일은 GitHub Actions(.github/workflows/weekly-update.yml)에 의해
   매주 월요일 오전 9시(KST)에 자동으로 갱신됩니다.
   ========================================================================== */

`;
  const archiveHeader = `/* ==========================================================================
   지난 뉴스(아카이브) 데이터
   매주 GitHub Actions 실행 시, 그 시점의 current-week-data.js 내용이
   이 배열의 맨 앞(unshift)에 추가되어 계속 쌓입니다. (최신 주차가 배열 맨 앞)
   ========================================================================== */

`;

  fs.writeFileSync(
    CURRENT_PATH,
    `${currentHeader}window.CURRENT_WEEK = ${JSON.stringify(currentWeek, null, 2)};\n`,
  );
  fs.writeFileSync(
    ARCHIVE_PATH,
    `${archiveHeader}window.ARCHIVE_WEEKS = ${JSON.stringify(archive, null, 2)};\n`,
  );

  console.log(`Collected ${allArticles.length} articles for ${periodLabel}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
