// Express 백엔드 서버 - PostgreSQL 연결
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 5000;

// 미들웨어 설정
app.use(cors());
app.use(express.json());

// PostgreSQL 연결 설정 (Pool 사용으로 최적화)
const pool = new Pool({
  host: '2dt-1st-team1.postgres.database.azure.com',
  database: 'postgres',
  user: 'dt21stteam1',
  password: '!25Dataschool',
  port: 5432,
  ssl: {
    rejectUnauthorized: false
  },
  max: 10, // 최대 연결 수
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// 헬스 체크 엔드포인트
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Backend server is running' });
});

// API 라우트: Hot 공고 조회
app.get('/api/jobs/hot', async (req, res) => {
  let client;
  try {
    client = await connectDB();
    
    const query = `
      SELECT 
        id, title, company, deadline, is_hot, location, salary, tags, created_at
      FROM job_total_info 
      WHERE is_hot = true 
      ORDER BY created_at DESC 
      LIMIT 10
    `;
    
    const result = await client.query(query);
    
    const jobs = result.rows.map(row => ({
      id: row.id,
      title: row.title,
      company: row.company,
      deadline: formatDate(row.deadline),
      isHot: row.is_hot,
      location: row.location,
      salary: row.salary,
      tags: typeof row.tags === 'string' ? JSON.parse(row.tags) : row.tags || [],
      createdAt: row.created_at
    }));

    res.json({ jobs });
    
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (client) await client.end();
  }
});

// API 라우트: 특정 공고 상세 조회
app.get('/api/jobs/:id', async (req, res) => {
  const { id } = req.params;
  let client;
  
  try {
    client = await connectDB();
    
    const query = `
      SELECT 
        id, title, company, deadline, is_hot, location, salary, tags, 
        description, requirements, created_at
      FROM job_total_info 
      WHERE id = $1
    `;
    
    const result = await client.query(query, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    const row = result.rows[0];
    const job = {
      id: row.id,
      title: row.title,
      company: row.company,
      deadline: formatDate(row.deadline),
      isHot: row.is_hot,
      location: row.location,
      salary: row.salary,
      tags: typeof row.tags === 'string' ? JSON.parse(row.tags) : row.tags || [],
      description: row.description,
      requirements: row.requirements,
      createdAt: row.created_at
    };

    res.json({ job });
    
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (client) await client.end();
  }
});

// 날짜 포맷팅 함수
function formatDate(date) {
  if (!date) return '';
  const d = new Date(date);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

// 서버 시작
app.listen(port, () => {
  console.log(`Backend server running on port ${port}`);
});

/*
백엔드 서버 설정 방법:

1. 새 폴더 생성: mkdir backend && cd backend
2. npm init -y
3. npm install express pg cors dotenv
4. 이 파일을 server.js로 저장
5. node server.js 실행

그 다음 프론트엔드에서:
- jobServiceAPI.js를 jobService.js로 교체
- REACT_APP_API_BASE_URL=http://localhost:3001/api 설정
*/