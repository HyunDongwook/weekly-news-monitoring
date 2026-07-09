import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const DATA_DIR = path.join(process.cwd(), 'data');
const CURRENT_PATH = path.join(DATA_DIR, 'current-week-data.js');
const ARCHIVE_PATH = path.join(DATA_DIR, 'archive-data.js');

const NAVER_CLIENT_ID = process.env.NAVER_CLIENT_ID;
const NAVER_CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET;

const CATEGORIES = [
  { key: 'welfare', query: '복지포인트 바우처' },
  { key: 'payment', query: '간편결제 멤버십' },
  { key: 'insurance', query: 'GA 보험대리점' },
  { key: 'aicc', query: 'AICC 컨택센터' },
  { key: 'safety', query: '산업안전 안전보건' },
];

const MAX_PER_CATEGORY = 5;
const EXCLUDE_URL_SUBSTR = ['msn.com'];

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
  return decodeEntities((str || '').replace(/<[^>]*>/g, '')).trim();
}

function formatDate(pubDate) {
  const d = new Date(pubDate);
  if (Number.isNaN(d.getTime())) return null;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// Naver's official News Search API: returns the real publisher URL (originallink)
// plus a ready-made Korean snippet (description) directly — no scraping, no
// redirect-resolution, no headless browser, and no bot-detection risk.
async function fetchCategoryArticles(category) {
  const url = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(
    category.query,
  )}&display=20&sort=date`;
  const res = await fetch(url, {
    headers: {
      'X-Naver-Client-Id': NAVER_CLIENT_ID,
      'X-Naver-Client-Secret': NAVER_CLIENT_SECRET,
    },
  });
  if (!res.ok) {
    throw new Error(`Naver API error ${res.status} ${res.statusText} for "${category.key}"`);
  }
  const data = await res.json();
  const items = data.items || [];

  const results = [];
  const seenUrls = new Set();
  for (const item of items) {
    if (results.length >= MAX_PER_CATEGORY) break;

    const articleUrl = item.originallink || item.link;
    if (!articleUrl) continue;
    if (EXCLUDE_URL_SUBSTR.some((s) => articleUrl.toLowerCase().includes(s))) continue;
    if (seenUrls.has(articleUrl)) continue;

    const date = formatDate(item.pubDate);
    if (!date) continue;

    const title = stripTags(item.title);
    let summary = stripTags(item.description);
    if (summary.length > 160) {
      summary = `${summary.slice(0, 157).trim()}...`;
    }

    let source = articleUrl;
    try {
      source = new URL(articleUrl).hostname.replace(/^www\./, '');
    } catch {
      // Keep the raw URL as a last-resort "source" label.
    }

    seenUrls.add(articleUrl);
    results.push({ category: category.key, title, summary, source, date, url: articleUrl });
  }
  return results;
}

function getPeriod(now) {
  // Workflow is scheduled for 00:07 UTC == 09:07 KST on the same calendar day.
  const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const day = kstNow.getUTCDay(); // 0=Sun .. 1=Mon
  const daysSinceMonday = (day + 6) % 7;
  const periodEndDate = new Date(kstNow);
  periodEndDate.setUTCDate(kstNow.getUTCDate() - daysSinceMonday - 1); // Sunday before this Monday
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
  if (!NAVER_CLIENT_ID || !NAVER_CLIENT_SECRET) {
    console.error('NAVER_CLIENT_ID / NAVER_CLIENT_SECRET environment variables are required.');
    process.exit(1);
  }

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

  const allArticles = [];
  for (const category of CATEGORIES) {
    try {
      const items = await fetchCategoryArticles(category);
      allArticles.push(...items);
    } catch (err) {
      console.error(`Category "${category.key}" failed:`, err.message);
    }
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
   매주 월요일 오전 9시(KST)에 자동으로 갱신됩니다. (네이버 뉴스 검색 API 사용)
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
