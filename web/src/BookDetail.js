// BookDetail.js
import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import './BookDetail.css';

export default function BookDetail() {
  const navigate = useNavigate();
  const location = useLocation();
  const book = location.state?.book;   // ← Search.js 에서 state로 넘긴 book

  if (!book) {
    // 새로고침하거나 URL만 직접 치고 들어온 경우
    return (
      <div className="book-root">
        <header className="book-header">
          <button className="btn back-btn" onClick={() => navigate(-1)}>뒤로</button>
          <h2>도서를 찾을 수 없습니다</h2>
        </header>
        <main className="book-main">
          <div className="card empty">
            해당 도서 정보를 찾을 수 없습니다.  
            (검색 화면에서 다시 선택해주세요.)
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="book-root">
      <header className="book-header">
        <button className="btn back-btn" onClick={() => navigate(-1)}>뒤로</button>
        <h2>{book.title}</h2>
      </header>

      <main className="book-main">
        <div className="card book-detail-card">
          <div className="detail-grid">
            <div className="cover-placeholder">
              {book.cover && (
                <img
                  src={book.cover}
                  alt={book.title}
                  className="cover-image"
                />
              )}            
            </div>
            <div className="detail-info">
              <div className="book-title large">{book.title}</div>
              <div className="book-author">{book.author}</div>
              <div className="book-desc">{book.description}</div>
              <div className="book-price">{book.price}</div>
              <div style={{ marginTop: 12 }}>
                {book.link && (
                  <a
                    href={book.link}
                    target="_blank"
                    rel="noreferrer"
                    className="btn primary"
                  >
                    구매하러 가기
                  </a>
                )}
                <button
                  className="btn"
                  style={{ marginLeft: 8 }}
                  onClick={() => navigate(-1)}
                >
                  목록으로
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}