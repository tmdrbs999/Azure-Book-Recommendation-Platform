// Express 백엔드 서버 - PostgreSQL 연결
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
require('dotenv').config();

// 📊 HOT 공고 캐시 시스템
let hotJobsCache = {
  data: [],
  lastUpdated: null,
  updateInterval: 10 * 60 * 1000, // 10분
  isUpdating: false
};


// openai 추가 부분
const OpenAI = require('openai');

const app = express();
const port = process.env.PORT || 5000;

// 미들웨어 설정 - 개발 환경을 위한 관대한 CORS 설정
app.use(cors({
  origin: true, // 모든 origin 허용 (개발 환경용)
  credentials: false,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['*'],
  optionsSuccessStatus: 200
}));

// 추가 헤더 설정
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

app.use(express.json());

// PostgreSQL 연결 설정 (Pool 사용으로 최적화)
const pool = new Pool({
  host: process.env.PG_HOST,
  database: process.env.PG_DATABASE,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  port: process.env.PG_PORT,
  ssl: {
    rejectUnauthorized: false
  },
  max: 10, // 최대 연결 수
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// 🔥 Azure OpenAI 클라이언트
const openai = new OpenAI({
  apiKey: process.env.AZURE_OPENAI_API_KEY,
  baseURL: process.env.AZURE_OPENAI_ENDPOINT, // https://.../openai/v1
});

// 📊 10분마다 최신 100건 기준 HOT 공고 업데이트 함수
async function updateHotJobs() {
  if (hotJobsCache.isUpdating) {
    console.log('⏳ HOT 공고 업데이트가 이미 진행 중입니다...');
    return;
  }

  try {
    hotJobsCache.isUpdating = true;
    console.log('🔄 10분 주기 HOT 공고 업데이트 시작...');

    const query = `
      SELECT 
        b.job_name,
        COUNT(*) as current_period_count,
        b.rcrit_jssfc_cmmn_code_se,
        CASE 
          WHEN b.job_name ILIKE '%요양보호사%' THEN COUNT(*) * 0.5
          ELSE COUNT(*)
        END as weighted_count
      FROM (
        SELECT rcrit_jssfc_cmmn_code_se
        FROM public.job_total_info 
        WHERE company IS NOT NULL 
          AND job_title IS NOT NULL
          AND rcrit_jssfc_cmmn_code_se IS NOT NULL
        ORDER BY eventprocessedutctime DESC
        LIMIT 100
      ) recent_jobs
      JOIN public.job_classification b
      ON recent_jobs.rcrit_jssfc_cmmn_code_se = b.rcrit_jssfc_cmmn_code_se
      GROUP BY b.job_name, b.rcrit_jssfc_cmmn_code_se
      HAVING COUNT(*) > 0
      ORDER BY weighted_count DESC, current_period_count DESC, b.job_name ASC
      LIMIT 3
    `;

    const result = await pool.query(query);

    const newHotJobs = result.rows.map((row, index) => ({
      id: index + 1,
      title: `🔥 ${row.job_name}`,
      // 가중치 적용된 값 사용 (점수)
      count: parseInt(row.weighted_count) || 0,
      jobCode: row.rcrit_jssfc_cmmn_code_se,
      originalData: {
        job_name: row.job_name,
        rank: index + 1,
        current_period_count: row.current_period_count, // 실제 개수
        weighted_count: row.weighted_count,             // 가중치 점수
        rcrit_jssfc_cmmn_code_se: row.rcrit_jssfc_cmmn_code_se,
        updated_at: new Date().toISOString()
      }
    }));

    hotJobsCache.data = newHotJobs.filter(job => job.count > 0);
    hotJobsCache.lastUpdated = new Date().toISOString();

    console.log(`✅ HOT 공고 업데이트 완료 (${hotJobsCache.data.length}개)`);
    hotJobsCache.data.forEach((job, index) => {
      const displayCount = job.count;
      const rawCount = job.originalData.current_period_count;
      const isWeighted = job.originalData.job_name.includes('요양보호사');
      const weightInfo = isWeighted 
        ? ` (원본 ${rawCount}건 → 가중치 적용 ${displayCount}점)` 
        : '';
      console.log(
        `  ${index + 1}. ${job.originalData.job_name}: ${displayCount}점${weightInfo}`
      );
    });

  } catch (error) {
    console.error('❌ HOT 공고 업데이트 실패:', error);
  } finally {
    hotJobsCache.isUpdating = false;
  }
}


// 헬스 체크 엔드포인트
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Backend server is running',
    hotJobsLastUpdated: hotJobsCache.lastUpdated,
    hotJobsCount: hotJobsCache.data.length
  });
});

// 📊 HOT 공고 조회 API (캐시된 데이터 사용 - 10분마다 갱신)
app.get('/api/jobs/hot', async (req, res) => {
  try {
    console.log('🔥 캐시된 HOT 공고 데이터 조회...');

    const now = Date.now();
    const lastUpdate = hotJobsCache.lastUpdated
      ? new Date(hotJobsCache.lastUpdated).getTime()
      : 0;
    const timeSinceUpdate = now - lastUpdate;

    // 캐시가 없거나 만료됐으면 즉시 갱신
    if (!hotJobsCache.lastUpdated || timeSinceUpdate > hotJobsCache.updateInterval) {
      console.log('📊 캐시가 만료되었습니다. 즉시 업데이트 실행...');
      await updateHotJobs();
    }

    const cachedData = hotJobsCache.data;

    console.log(`✅ 캐시된 HOT 공고 ${cachedData.length}개 반환`);
    cachedData.forEach((job, index) => {
      const actualCount = job.count;
      const isWeighted = job.originalData.job_name.includes('요양보호사');
      const weightInfo = isWeighted ? ' (가중치 적용됨)' : '';
      console.log(`  ${index + 1}. ${job.originalData.job_name}: ${actualCount}건${weightInfo}`);
    });

    res.json({
      success: true,
      data: cachedData,
      count: cachedData.length,
      message: '최근 100건 기준 HOT 공고 (10분마다 갱신)',
      lastUpdated: hotJobsCache.lastUpdated,
      nextUpdate: new Date(lastUpdate + hotJobsCache.updateInterval).toISOString(),
      dataSource: 'cached',
      period: '10분 주기'
    });

  } catch (error) {
    console.error('❌ HOT 공고 조회 오류:', error);
    res.status(500).json({
      success: false,
      data: [],
      count: 0,
      message: 'HOT 공고 데이터를 가져올 수 없습니다',
      error: error.message
    });
  }
});

// API 라우트: 키워드로 공고 검색 (job_title 기준 LIKE 검색)
app.get('/api/jobs/search', async (req, res) => {
  try {
    const keyword = req.query.keyword;
    console.log(`🔍 Searching jobs with keyword: ${keyword}`);

    if (!keyword || keyword.trim() === '') {
      return res.status(400).json({ 
        success: false, 
        message: '검색 키워드가 필요합니다.' 
      });
    }

    const query = `
      SELECT 
        company, job_title, wage_type, wage_value_krw, 
        region, career, jobcode_nm, wage_value_monthly
      FROM public.job_total_info 
      WHERE job_title ILIKE $1
      AND company IS NOT NULL
      AND job_title IS NOT NULL
      ORDER BY eventprocessedutctime DESC 
      LIMIT 50
    `;

    const searchTerm = `%${keyword}%`; 
    const result = await pool.query(query, [searchTerm]);

    const jobs = result.rows.map(row => ({
      id: row.id,
      title: row.job_title,
      company: row.company,
      location: row.region,
      salary: formatSalary(row.wage_type, row.wage_value_krw, row.wage_value_monthly), 
      career: row.career,
    }));
    
    console.log(`✅ Found ${jobs.length} jobs for keyword: ${keyword}`);

    res.json({
      success: true,
      data: jobs,
      totalCount: jobs.length,
      keyword: keyword
    });

  } catch (error) {
    console.error('❌ Search API error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// 🔥 새로운 API: HOT 공고 클릭시 해당 직무 코드의 모든 공고 조회
app.get('/api/jobs/by-code', async (req, res) => {
  try {
    const { keyword } = req.query;
    console.log('🔍 Searching jobs by keyword for job code:', keyword);
    
    if (!keyword) {
      return res.status(400).json({
        success: false,
        message: 'Keyword is required'
      });
    }
    
    const codeQuery = `
      SELECT DISTINCT rcrit_jssfc_cmmn_code_se 
      FROM public.job_classification 
      WHERE job_name ILIKE $1
      LIMIT 1
    `;
    
    const codeResult = await pool.query(codeQuery, [`%${keyword}%`]);
    
    if (codeResult.rows.length === 0) {
      return res.json({
        success: true,
        data: [],
        message: 'No matching job code found for keyword',
        keyword: keyword
      });
    }
    
    const jobCode = codeResult.rows[0].rcrit_jssfc_cmmn_code_se;
    console.log(`✅ Found job code: ${jobCode} for keyword: ${keyword}`);
    
    const jobsQuery = `
      SELECT 
        company, 
        job_title, 
        wage_type, 
        wage_value_krw, 
        wage_value_monthly,
        region, 
        career, 
        jobcode_nm,
        eventprocessedutctime,
        rcrit_jssfc_cmmn_code_se
      FROM public.job_total_info 
      WHERE rcrit_jssfc_cmmn_code_se = $1
      AND company IS NOT NULL
      AND job_title IS NOT NULL
      ORDER BY eventprocessedutctime DESC
      LIMIT 50
    `;
    
    const jobsResult = await pool.query(jobsQuery, [jobCode]);
    
    const jobs = jobsResult.rows.map((row, index) => ({
      id: `hot-${jobCode}-${index}`,
      title: row.job_title || '제목 없음',
      company: row.company || '회사명 없음',
      location: row.region || '전국',
      salary: formatSalary(row.wage_type, row.wage_value_krw, row.wage_value_monthly),
      career: row.career,
      jobCategory: row.jobcode_nm,
      postedAt: row.eventprocessedutctime,
      jobCode: jobCode
    }));
    
    console.log(`✅ Found ${jobs.length} jobs for job code: ${jobCode}`);
    
    res.json({
      success: true,
      data: jobs,
      totalCount: jobs.length,
      keyword: keyword,
      jobCode: jobCode,
      searchType: 'by-code'
    });
    
  } catch (error) {
    console.error('❌ Job code search error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 급여 포맷팅 함수
function formatSalary(wageType, wageValueKrw, wageValueMonthly) {
  if (!wageValueKrw) return '협의';
  
  const value = parseInt(wageValueKrw);
  
  if (wageType === '월급') {
    if (value >= 10000000) {
      return `${Math.floor(value / 10000)}만원`;
    } else if (value >= 1000000) {
      return `${Math.floor(value / 10000)}만원`;
    } else {
      return `${value.toLocaleString()}원`;
    }
  } else if (wageType === '시급') {
    const hourly = value.toLocaleString();
    const monthly = wageValueMonthly ? `(월 ${Math.floor(parseFloat(wageValueMonthly) / 10000)}만원)` : '';
    return `시급 ${hourly}원 ${monthly}`;
  } else {
    return `${Math.floor(value / 10000)}만원`;
  }
}

// 서버 시작
app.listen(port, async () => {
  console.log(`🚀 Backend server running on port ${port}`);

  console.log('📊 HOT 공고 캐시 시스템 초기화 중...');
  await updateHotJobs(); // 서버 시작할 때 1번 업데이트

  setInterval(async () => {
    console.log('⏰ 정기 HOT 공고 업데이트 실행...');
    await updateHotJobs();
  }, hotJobsCache.updateInterval);

  console.log(`🔗 API Base URL: http://localhost:${port}/api`);
  console.log(`❤️ Health Check: http://localhost:${port}/api/health`);
  console.log(`⏰ HOT 공고 자동 업데이트: 10분 주기`);
});

// 프로세스 종료 시 정리
process.on('SIGINT', () => {
  console.log('\n🛑 Server shutting down...');
  pool.end().then(() => {
    console.log('✅ Database pool closed');
    process.exit(0);
  });
});

// Azure open AI 검색어 → 임베딩 벡터 얻는 함수
async function getEmbedding(text) {
  if (!text || !text.trim()) return null;

  const res = await openai.embeddings.create({
    model: process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT, // aladin-embedding
    input: text,
  });

  const embedding = res.data[0].embedding; // float[]
  console.log('🔎 embedding length =', embedding.length);
  return embedding;
}

// 🔥 공통 Aladin ItemSearch 호출 함수
async function aladinSearch({ query, categoryId = null, maxResults = 10 }) {
  const API_KEY = process.env.ALADIN_KEY;
  const baseUrl = 'http://www.aladin.co.kr/ttb/api/ItemSearch.aspx';

  let url =
    `${baseUrl}?ttbkey=${API_KEY}` +
    `&Query=${encodeURIComponent(query)}` +
    `&QueryType=ItemSearch` +
    `&SearchTarget=Book` +
    `&Sort=Accuracy` +
    `&MaxResults=${maxResults}` +
    `&start=1` +
    `&Cover=Big` +
    `&output=js` +
    `&Version=20131101`;

  if (categoryId) {
    url += `&CategoryId=${categoryId}`;
  }

  const response = await fetch(url);
  const data = await response.json();
  return data.item || [];
}

function mergeUniqueByItemId(baseList, newItems) {
  const seen = new Set(baseList.map(b => b.itemId));
  for (const item of newItems) {
    if (!seen.has(item.itemId)) {
      baseList.push(item);
      seen.add(item.itemId);
    }
  }
  return baseList;
}

// 알라딘 책 검색용 키워드 정제 ver final
function buildBookQuery(raw) {
  if (!raw) return '';

  const stopwords = ['및', '등', '관련', '분야', '수리원', '종사자'];
  
  const tokens = raw
    .replace(/[^가-힣0-9a-zA-Z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter(t => !stopwords.includes(t));

  const main = tokens.slice(0, 2);

  return main.join(' ') || raw;
}

//아무 책도 안 떳을 때 보험용 ver final
async function fetchBooksByCid(cid) {
  const API_KEY = process.env.ALADIN_KEY;
  const url =
    `http://www.aladin.co.kr/ttb/api/ItemList.aspx` +
    `?ttbkey=${API_KEY}` +
    `&QueryType=Bestseller` +
    `&MaxResults=10` +
    `&start=1` +
    `&Cover=Big` +
    `&CategoryId=${cid}` +
    `&SearchTarget=Book` +
    `&output=js` +
    `&Version=20131101`;

  console.log("⚡ [Bestseller API] 요청 URL:", url);

  const response = await fetch(url);

  if (!response.ok) {
    console.log("❌ Bestseller API HTTP 오류:", response.status, response.statusText);
    return [];
  }

  const text = await response.text();
  console.log("⚡ Bestseller API Response TEXT:", text.slice(0, 200));

  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    console.log("❌ JSON 파싱 오류:", e.message);
    return [];
  }

  if (data.errorMessage) {
    console.log("❌ Aladin API 에러:", data.errorMessage);
    return [];
  }

  return data.item || [];
}

//알라딘 책 단계별 검색 ver final
async function fetchSmartBooks(bestCategory, keyword) {
  const { cid, full_path } = bestCategory;
  const results = [];

  const searchKeyword = buildBookQuery(keyword);
  console.log('📚 Aladin search keyword:', searchKeyword);

  const pathParts = full_path.split(/[\/\s]+/).filter(Boolean);
  const leafCategory = pathParts[pathParts.length - 1] || '';

  // 1️⃣ 카테고리 + 정제된 검색어
  const step1 = await aladinSearch({ query: searchKeyword, categoryId: cid, maxResults: 10 });
  mergeUniqueByItemId(results, step1);
  if (results.length >= 10) return results.slice(0, 10);

  // 2️⃣ (정제된 검색어 + leafCategory), CategoryId 없음
  const queryWithCategory = `${searchKeyword} ${leafCategory}`.trim();
  const step2 = await aladinSearch({ query: queryWithCategory, categoryId: null, maxResults: 10 });
  mergeUniqueByItemId(results, step2);
  if (results.length >= 10) return results.slice(0, 10);

  // 3️⃣ 정제된 검색어만, 전체에서
  const step3 = await aladinSearch({ query: searchKeyword, categoryId: null, maxResults: 10 });
  mergeUniqueByItemId(results, step3);

  // 0) 쓰레기 item 필터링
  const cleaned = results.filter(item =>
    item &&
    item.itemId &&
    item.itemId !== 0 &&
    item.title && item.title.trim().length > 0
  );

  if (cleaned.length === 0) {
    console.log('📚 ItemSearch 결과 없음 → 베스트셀러 fallback');
    const bestsellers = await fetchBooksByCid(cid);
    console.log(`📚 Bestseller 결과: ${bestsellers.length}권`);
    return bestsellers.slice(0, 10);
  }

  return cleaned.slice(0, 10);
}

function parseAladinItems(items) {
  return items.map(book => {
    const basePrice = book.priceSales || book.priceStandard || 0;
 
    return {
      rank: book.bestRank,
      title: book.title,
      author: book.author,
      priceSales: book.priceSales,
      priceStandard: book.priceStandard,
      price: basePrice
        ? basePrice.toLocaleString('ko-KR') + '원'
        : null,
      description: book.description,
      cover: book.cover,
      itemId: book.itemId,
      isbn: book.isbn,
      isbn13: book.isbn13,
      link: book.link
    };
  });
}

//cid와 책리스트 가져오는 API
//ver5 OPEN AI embedding 추가
app.get('/api/search', async (req, res) => {
  const t0 = Date.now();
  
  try {
    const keyword = req.query.keyword || "";
    if (!keyword.trim()) return res.json({ cid: null });

    console.log(`🔍 [Aladin] 검색: ${keyword}`);

    // 1) 임베딩 생성
    const embedding = await getEmbedding(keyword);
    const t1 = Date.now();
    console.log(`⏱ 임베딩 생성: ${t1 - t0} ms`);

    const vector = '[' + embedding.join(',') + ']';

    // 2) 벡터 검색
    const { rows } = await pool.query(`
      SELECT cid, full_path
      FROM aladin_category_embedding2
      ORDER BY embedding <-> $1::vector
      LIMIT 5;
    `, [vector]);
    const t2 = Date.now();
    console.log(`⏱ Postgres 벡터 검색: ${t2 - t1} ms`);

    if (rows.length === 0) {
      return res.json({ cid: null, reason: 'no_category_match' });
    }

    const cid = parseInt(rows[0].cid);
    if (isNaN(cid)) {
      console.log("❌ CID 변환 실패:", rows[0].cid);
    }
    const best = { cid, full_path: rows[0].full_path };

    // 3) 책 API (스마트 다단계 검색)
    const items = await fetchSmartBooks(best, keyword);
    const t3 = Date.now();
    console.log(`⏱ Aladin API(스마트): ${t3 - t2} ms`);
    console.log("🔥 CID 결과:", best.cid, best.full_path, ` / 도서수: ${items.length}`);

    res.json({
      cid: best.cid,
      path: best.full_path,
      books: parseAladinItems(items),
      cost: `${t3 - t0}ms`
    });

  } catch (e) {
    console.error('❌ [Aladin] /search error:', e);
    res.status(500).json({ error: true, message: e.message });
  }
});
