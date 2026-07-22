import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const DATA_DIR = path.join(process.cwd(), 'data');
const CANDIDATES_PATH = path.join(DATA_DIR, 'candidates.json');

const NAVER_CLIENT_ID = process.env.NAVER_CLIENT_ID;
const NAVER_CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET;

// Flat keyword list (no category grouping - curation/classification now happens
// downstream, outside this script, by reading each candidate article).
const KEYWORDS = [
  'SK엠앤서비스',
  '베네피아',
  '이지웰',
  '이제너두',
  '네이버페이 복지',
  '복지몰',
  '복지포인트',
  '선택적복지',
  '기업복지',
  '복지정책',
  'B2E',
  '공공 바우처',
  '복지플랫폼',
  '복지 제휴',
  'AICC',
  'BPO',
  '고객센터',
  '결제 서비스',
  'GA',
  '보험 TM',
  '보험DB',
  '상조업',
  '멤버십',
  '구독',
  'HRM',
  '산업 안전 솔루션',
  '근로자휴가지원',
  '삼구아이앤씨',
  '시니어',
  '관제플랫폼',
];

// Maps bare hostnames to their real Korean media name (verified by visiting
// each site directly, not guessed from the domain).
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
    'gosiweek.com': '피앤피뉴스',
    'etnews.com': '전자신문',
    'epnc.co.kr': '테크월드',
    'etoday.co.kr': '이투데이',
    'mk.co.kr': '매일경제',
    'traveltimes.co.kr': '여행신문',
    'topdaily.kr': '톱데일리',
    'biz.heraldcorp.com': '헤럴드경제',
    'news1.kr': '뉴스1',
    'biz.chosun.com': '조선비즈',
    'ajunews.com': '아주경제',
    'businesspost.co.kr': '비즈니스포스트',
    'dailysmart.co.kr': '스마트경제',
    'dealsite.co.kr': '딜사이트',
    'news2day.co.kr': '뉴스투데이',
    'insnews.co.kr': '한국보험신문',
    'job-post.co.kr': '잡포스트',
    'asiatoday.co.kr': '아시아투데이',
    'viva100.com': '브릿지경제',
    'm-i.kr': '매일일보',
    'news.bizwatch.co.kr': '비즈워치',
    'sedaily.com': '서울경제',
    'econovill.com': 'ER 이코노믹리뷰',
    'fins.co.kr': '보험매일',
    'sateconomy.co.kr': '토요경제',
    '4th.kr': '포쓰저널',
    'ksilbo.co.kr': '경상일보',
    'beyondpost.co.kr': '비욘드포스트',
    'bloter.net': '블로터',
    'cnbnews.com': 'CNB뉴스',
    'ddaily.co.kr': '디지털데일리',
    'ezyeconomy.com': '이지경제',
    'kr.aving.net': '에이빙',
    'press9.kr': '프레스나인',
    'pressman.kr': '프레스맨',
    'youthdaily.co.kr': '청년일보',
    'labortoday.co.kr': '매일노동뉴스',
    'koreadaily.com': '미주중앙일보',
    'mbn.co.kr': 'MBN',
    'kookje.co.kr': '국제신문',
    'dt.co.kr': '디지털타임스',
    'it.chosun.com': 'IT조선',
    'mediapen.com': '미디어펜',
    'newsis.com': '뉴시스',
    'economist.co.kr': '이코노미스트',
    'newstomato.com': '뉴스토마토',
    'newsprime.co.kr': '프라임경제',
    'cstimes.com': '컨슈머타임스',
    'sentv.co.kr': '서울경제TV',
    'consumernews.co.kr': '소비자가만드는신문',
    'ktnews.com': '한국섬유신문',
    'cwn.kr': 'CWN',
    'zdnet.co.kr': '지디넷코리아',
    'donga.com': '동아일보',
    'joongang.co.kr': '중앙일보',
    'hankyung.com': '한국경제',
    'e-science.co.kr': '이코노미사이언스',
    'koit.co.kr': '정보통신신문',
    'ulsanpress.net': '울산신문',
    'whitepaper.co.kr': '화이트페이퍼',
    'newsdream.kr': '뉴스드림',
};

const EXCLUDE_URL_SUBSTR = ['msn.com'];

// Per-keyword cap so one broad keyword (e.g. "구독", "멤버십") can't drown out
// niche keywords (e.g. "삼구아이앤씨") once everything is merged together.
const PER_KEYWORD_CAP = 25;

// Two article titles that share at least this fraction of character bigrams
// are treated as "the same event"; only the first (most recent, since results
// are sorted by date before this check runs) is kept.
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

// Fetches up to 5 pages (500 items) of a single keyword's search results,
// sorted by date descending, stopping early once a page's oldest item is
// already older than periodStart or once a page returns fewer than 100 items.
async function fetchQueryItems(query, periodStart) {
  const allItems = [];
  for (let page = 0; page < 5; page++) {
    const start = page * 100 + 1;
    const url = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(
      query,
    )}&display=100&start=${start}&sort=date`;
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
    const items = data.items || [];
    if (items.length === 0) break;
    for (const item of items) {
      allItems.push({ ...item, _matchedKeyword: query });
    }
    const oldestDate = formatDate(items[items.length - 1].pubDate);
    if (oldestDate && oldestDate < periodStart) break;
    if (items.length < 100) break;
  }
  return allItems;
}

// Fetches + filters + dedupes candidates for a single keyword. Returns plain
// candidate objects (no category field) capped at PER_KEYWORD_CAP.
async function fetchKeywordCandidates(keyword, periodStart, periodEnd) {
  let items;
  try {
    items = await fetchQueryItems(keyword, periodStart);
  } catch (err) {
    console.error(`Keyword "${keyword}" failed:`, err.message);
    return [];
  }

  items.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

  const results = [];
  const seenUrls = new Set();
  const selectedTitleBigrams = [];
  for (const item of items) {
    const articleUrl = item.originallink || item.link;
    if (!articleUrl) continue;
    if (EXCLUDE_URL_SUBSTR.some((s) => articleUrl.toLowerCase().includes(s))) continue;
    if (seenUrls.has(articleUrl)) continue;

    const date = formatDate(item.pubDate);
    if (!date) continue;
    if (date < periodStart || date > periodEnd) continue;

    const title = stripTags(item.title);
    const descriptionText = stripTags(item.description);

    // Naver's news search appears to match on individual words rather than
    // exact phrases, so a multi-word keyword can match articles that merely
    // contain the words separately. Require the literal keyword phrase
    // (ignoring whitespace) to actually appear in the title+description.
    const haystack = (title + descriptionText).replace(/\s+/g, '');
    const needle = keyword.replace(/\s+/g, '');
    if (needle && !haystack.includes(needle)) continue;

    if (isNearDuplicateTitle(title, selectedTitleBigrams)) continue;

    let source = articleUrl;
    try {
      const hostname = new URL(articleUrl).hostname.replace(/^www\./, '');
      source = SOURCE_NAME_MAP[hostname] || hostname;
    } catch {
      // malformed URL; fall back to using the raw URL as the source label
    }

    seenUrls.add(articleUrl);
    selectedTitleBigrams.push(titleBigramSet(title));
    results.push({
      title,
      summary: decodeEntities(item.description ? stripTags(item.description) : ''),
      source,
      date,
      url: articleUrl,
      matchedKeyword: keyword,
    });
    if (results.length >= PER_KEYWORD_CAP) break;
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

  const allCandidates = [];
  for (const keyword of KEYWORDS) {
    const items = await fetchKeywordCandidates(keyword, periodStart, periodEnd);
    allCandidates.push(...items);
  }

  // Cross-keyword dedupe: same URL, or near-duplicate title (an article can
  // legitimately match multiple keywords).
  allCandidates.sort((a, b) => new Date(b.date) - new Date(a.date));
  const finalCandidates = [];
  const seenUrls = new Set();
  const selectedTitleBigrams = [];
  for (const c of allCandidates) {
    if (seenUrls.has(c.url)) continue;
    if (isNearDuplicateTitle(c.title, selectedTitleBigrams)) continue;
    seenUrls.add(c.url);
    selectedTitleBigrams.push(titleBigramSet(c.title));
    finalCandidates.push(c);
  }

  if (finalCandidates.length === 0) {
    console.error('No candidates collected; aborting without touching data files.');
    process.exit(1);
  }

  const output = {
    periodLabel,
    periodStart,
    periodEnd,
    generatedAt,
    candidateCount: finalCandidates.length,
    candidates: finalCandidates,
  };

  const header = `/* ==========================================================================
   이번 주 뉴스 후보 목록 (자동 수집, 미가공)
   .github/workflows/weekly-update.yml 에 의해 매주 월요일 오전 9시(KST)경
   네이버 뉴스 검색 API로 자동 수집됩니다. 이 파일은 최종 발행본이 아니며,
   내용을 읽고 충실도/중복/단신·광고성 여부를 판단하는 별도 큐레이션 이후
   data/current-week-data.js 로 반영됩니다.
   ========================================================================== */

`;

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CANDIDATES_PATH, header + JSON.stringify(output, null, 2) + '\n');

  console.log(`Collected ${finalCandidates.length} candidates for ${periodLabel}.`);

  // Self-contained commit: this lets the workflow that runs this script stay
  // a plain "checkout + run script" job without needing its own git-add step
  // to know about this specific file. Silently no-ops outside CI or when
  // there's nothing new to commit.
  if (process.env.GITHUB_ACTIONS === 'true') {
    try {
      execSync('git config user.name "github-actions[bot]"');
      execSync('git config user.email "41898282+github-actions[bot]@users.noreply.github.com"');
      execSync(`git add ${CANDIDATES_PATH}`);
      execSync('git diff --cached --quiet', { stdio: 'ignore' });
      console.log('No candidate changes to commit.');
    } catch {
      // git diff --cached --quiet exits non-zero when there IS a diff
      try {
        execSync('git commit -m "Weekly news candidates collected"', { stdio: 'inherit' });
        execSync('git push', { stdio: 'inherit' });
        console.log('Committed and pushed data/candidates.json.');
      } catch (pushErr) {
        console.error('Failed to commit/push candidates.json:', pushErr.message);
      }
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
