import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const DATA_DIR = path.join(process.cwd(), 'data');
const CURRENT_PATH = path.join(DATA_DIR, 'current-week-data.js');
const ARCHIVE_PATH = path.join(DATA_DIR, 'archive-data.js');

const NAVER_CLIENT_ID = process.env.NAVER_CLIENT_ID;
const NAVER_CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET;

const CATEGORIES = [
  {
        key: 'welfare',
        keywords: [
                'SK엠앤서비스',
                '베네피아',
                '이지웰',
                '이제너두',
                '네이버페이 복지',
                '복지몰',
                '복지포인트',
                '복지서비스',
                '선택적복지',
                '기업복지',
                '복지정책',
                'B2E',
                '공공 바우처',
                '복지플랫폼',
                '복지 제휴',
                '복지 유통',
                '근로자휴가지원',
              ],
  },
  {
        key: 'solution',
        keywords: ['산업 안전 솔루션', '모빌리티', 'HRM'],
  },
  {
        key: 'bpo',
        keywords: ['AICC', 'BPO', '고객센터', '관제플랫폼', '삼구아이앤씨'],
  },
  {
        key: 'marketing',
        keywords: ['멤버십', '구독', '결제 서비스', 'GA', '보험 TM', '보험DB', '상조업', '실버산업'],
  },
  ];

const SOURCE_NAME_MAP = {
  'ibabynews.com': '베이비뉴스',
  'breaknews.com': '브레이크뉴스',
  'dynews.co.kr': '동양일보',
  'ccdn.co.kr': '충청매일',
  'namdonews.com': '남도일보',
  'wikileaks-kr.org': '위키리크스한국',
  'the-biz.co.kr': '더비즈',
  'news.dealsitetv.com': '딜사이트경제TV',
  'segye.com': '세계일보',
  'kbanker.co.kr': '대한금융신문',
  'edaily.co.kr': '이데일리',
  'sisaon.co.kr': '시사오늘',
  'ilyoseoul.co.kr': '일요서울',
  'thebell.co.kr': '더벨',
  'dailypop.kr': '데일리팝',
  'fetv.co.kr': 'FETV',
  'mt.co.kr': '머니투데이',
  'itdaily.kr': '아이티데일리',
  'thefirstmedia.net': '더퍼스트미디어',
  'catchnews.kr': '캐치뉴스',
  'wsobi.com': '여성소비자신문',
  'hansbiz.co.kr': '한스경제',
  'ccreview.co.kr': '충청리뷰',
  'kookbang.dema.mil.kr': '국방일보',
};

const MAX_PER_CATEGORY = 5;
const EXCLUDE_URL_SUBSTR = ['msn.com'];

// Two article titles that share at least this fraction of character bigrams
// are treated as "the same event" and only the first (most recent, since
// results are sorted by date before this check runs) is kept. This is what
// stops near-duplicate coverage of a single press release (e.g. three
// outlets covering the same event) from filling up a whole category.
const TITLE_DEDUPE_THRESHOLD = 0.5;

function normalizeTitleForDedupe(title) {
  return (title || '')
  .replace(/\[[^\]]*\]/g, ' ')
  .replace(/[^\p{L}\p{N}]+/gu, '')
  .toLowerCase();
}

function titleBigramSet(title) {
  const norm = normalizeTitleForDedupe(title);
  const set = new Set();
  for (let i = 0; i < norm.length - 1; i++) {
    set.add(norm.slice(i, i + 2));
  }
  return set;
}

function jaccardSimilarity(setA, setB) {
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const gram of setA) {
    if (setB.has(gram)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function isNearDuplicateTitle(title, selectedBigramSets) {
  const bigrams = titleBigramSet(title);
  return selectedBigramSets.some(
    (existing) => jaccardSimilarity(bigrams, existing) >= TITLE_DEDUPE_THRESHOLD,
    );
}

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
async function fetchQueryItems(query) {
  const url = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(
    query,
    )}&display=30&sort=date`;
  const res = await fetch(url, {
    headers: {
      'X-Naver-Client-Id': NAVER_CLIENT_ID,
      'X-Naver-Client-Secret': NAVER_CLIENT_SECRET,
    },
  });
  if (!res.ok) {
    throw new Error(`Naver API error ${res.status} ${res.statusText} for query "${query}"`);
  }
  const data = await res.json();
  return data.items || [];
}

// A category now maps to a list of keywords instead of a single query, so we
// call the API once per keyword and merge everything before deduping/capping.
async function fetchCategoryArticles(category) {
  const allItems = [];
  for (const keyword of category.keywords) {
    try {
      const items = await fetchQueryItems(keyword);
      allItems.push(...items);
    } catch (err) {
      console.error(`Keyword "${keyword}" (category "${category.key}") failed:`, err.message);
    }
  }

allItems.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

const results = [];
  const seenUrls = new Set();
  const selectedTitleBigrams = [];
  for (const item of allItems) {
    if (results.length >= MAX_PER_CATEGORY) break;

  const articleUrl = item.originallink || item.link;
    if (!articleUrl) continue;
    if (EXCLUDE_URL_SUBSTR.some((s) => articleUrl.toLowerCase().includes(s))) continue;
    if (seenUrls.has(articleUrl)) continue;

  const date = formatDate(item.pubDate);
    if (!date) continue;

  const title = stripTags(item.title);
    if (isNearDuplicateTitle(title, selectedTitleBigrams)) continue;

  let summary = stripTags(item.description);
    if (summary.length > 160) {
      summary = `${summary.slice(0, 157).trim()}...`;
    }

  let source = articleUrl;
    try {
      const hostname = new URL(articleUrl).hostname.replace(/^www\./, '');
      source = SOURCE_NAME_MAP[hostname] || hostname;
    } catch {
    }

  seenUrls.add(articleUrl);
    selectedTitleBigrams.push(titleBigramSet(title));
    results.push({ category: category.key, title, summary, source, date, url: articleUrl });
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
  if (
    outgoing &&
    Array.isArray(outgoing.articles) &&
    outgoing.articles.length > 0 &&
    outgoing.periodLabel !== periodLabel
    ) {
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
