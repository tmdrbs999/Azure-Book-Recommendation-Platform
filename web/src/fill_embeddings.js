// fill_embeddings.js
require('dotenv').config();
const { Pool } = require('pg');
const OpenAI = require('openai');

// Postgres 연결
const pool = new Pool({
  host: process.env.PG_HOST,
  database: process.env.PG_DATABASE,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  port: process.env.PG_PORT,
  ssl: { rejectUnauthorized: false },
});

// Azure OpenAI 클라이언트
const openai = new OpenAI({
  apiKey: process.env.AZURE_OPENAI_API_KEY,
  baseURL: process.env.AZURE_OPENAI_ENDPOINT, // https://.../openai/v1
});

async function getEmbedding(text) {
  if (!text || !text.trim()) return null;

  const res = await openai.embeddings.create({
    model: process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT, // aladin-embedding
    input: text,
  });

  return res.data[0].embedding; // float[]
}

async function main() {
  const client = await pool.connect();
  try {
    console.log('📥 embedding IS NULL 인 카테고리 조회 중...');
    const { rows } = await client.query(`
      SELECT cid, full_path
      FROM aladin_category_embedding2
      WHERE embedding IS NULL
      ORDER BY cid
    `);

    console.log(`총 ${rows.length}개 카테고리 임베딩 생성 시작`);

    for (let i = 0; i < rows.length; i++) {
      const { cid, full_path } = rows[i];

      const emb = await getEmbedding(full_path);
      if (!emb) {
        console.warn(`⚠️ cid=${cid} 임베딩 생성 실패, skip`);
        continue;
      }

      // pgvector는 "[1,2,3,...]" 문자열도 허용
      const vectorString = '[' + emb.join(',') + ']';

      await client.query(
        `UPDATE aladin_category_embedding2
         SET embedding = $1::vector
         WHERE cid = $2`,
        [vectorString, cid]
      );

      if ((i + 1) % 100 === 0) {
        console.log(`✅ ${(i + 1)} / ${rows.length} 개 완료`);
      }
    }

    console.log('🎉 임베딩 채우기 완료');
  } catch (err) {
    console.error('❌ 임베딩 채우기 중 오류:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
