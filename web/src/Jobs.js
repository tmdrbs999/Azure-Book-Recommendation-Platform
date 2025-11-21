import React from 'react';
import { useNavigate } from 'react-router-dom';
import './Jobs.css';

const ANNOUNCEMENTS = [
  { id: 1, title: '웹 개발자 채용공고', company: '테크 컴퍼니', deadline: '2025.12.31', isNew: true, location: '서울' },
  { id: 2, title: '프론트엔드 개발자', company: '스타트업', deadline: '2025.12.15', isNew: true, location: '원격' },
  { id: 3, title: '백엔드 개발자 (Spring)', company: '엔터프라이즈', deadline: '2026.01.10', isNew: false, location: '부산' },
];

export default function Jobs() {
  const navigate = useNavigate();

  return (
    <div className="jobs-root">
      <header className="jobs-header">
        <button className="btn back-btn" onClick={() => navigate('/')}>홈으로</button>
        <h1>채용 공고</h1>
      </header>

      <main className="jobs-main">
        <div className="jobs-list">
          {ANNOUNCEMENTS.map(a => (
            <article key={a.id} className="job-card">
              <div className="job-header">
                <h3>{a.title}</h3>
                {a.isNew && <span className="new-badge">New</span>}
              </div>
              <div className="job-meta">{a.company} · {a.location} · 마감: {a.deadline}</div>
              <p className="job-excerpt">간단한 공고 설명이 들어갑니다. 지원 자격과 우대사항을 확인하세요.</p>
              <div className="job-actions">
                <button className="btn">자세히 보기</button>
              </div>
            </article>
          ))}
        </div>
      </main>
    </div>
  );
}
