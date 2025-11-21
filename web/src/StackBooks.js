import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import './StackBooks.css';
import { getBooksByStack } from './data/books';

export default function StackBooks() {
  const { stackName } = useParams();
  const navigate = useNavigate();
  const books = getBooksByStack(stackName);

  return (
    <div className="stack-root">
      <header className="stack-header">
        <button className="btn back-btn" onClick={() => navigate(-1)}>뒤로</button>
        <h2>{stackName} 추천 자료</h2>
      </header>

      <main className="stack-main">
        {books.length === 0 ? (
          <div className="card empty">해당 스택에 대한 추천 자료가 없습니다.</div>
        ) : (
          <div className="book-grid">
            {books.map((b) => (
              <div key={b.id} className="book-card" onClick={() => navigate(`/book/${b.id}`)} style={{cursor:'pointer'}}>
                <div className="book-card-body">
                  <div className="book-title">{b.title}</div>
                  <div className="book-author">{b.author}</div>
                  <div className="book-desc">{b.desc}</div>
                </div>
                <div className="book-footer">{b.price}</div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
