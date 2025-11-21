// Search.js
import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import './Search.css';
import { searchJobs, searchJobsByCode } from './services/jobService';
import { searchYouTubeVideos, truncateTitle, getRelativeTime } from './services/youtubeService';
import logo from './assets/ccpp-logo.svg';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || '/api';

// 책 제목 길이 제한 함수
const truncateBookTitle = (title, maxLength = 25) => {
  if (!title) return '';
  return title.length <= maxLength ? title : title.substring(0, maxLength) + '...';
};

function Search() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchKeyword, setSearchKeyword] = useState('');

  // 공고(왼쪽) 페이지네이션
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(4);

  // 알라딘 책 리스트
  const [books, setBooks] = useState([]);

  // 책(가운데) 페이지네이션 (3개씩 보이게)
  const [bookPage, setBookPage] = useState(1);
  const booksPerPage = 3;

  // 유튜브 영상 리스트
  const [youtubeVideos, setYoutubeVideos] = useState([]);
  const [youtubeLoading, setYoutubeLoading] = useState(false);

  const keyword = searchParams.get('keyword') || '';
  const searchType = searchParams.get('searchType') || '';

  // 공고 페이지네이션 계산
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = searchResults.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(searchResults.length / itemsPerPage);

  // 책 페이지네이션 계산
  const totalBookPages = Math.ceil(books.length / booksPerPage);
  const bookStartIndex = (bookPage - 1) * booksPerPage;
  const currentBooks = books.slice(bookStartIndex, bookStartIndex + booksPerPage);

  useEffect(() => {
    if (keyword) {
      setSearchKeyword(keyword);
      performSearch(keyword, searchType);
    } else {
      setLoading(false);
      setSearchResults([]);
      setBooks([]);
    }
  }, [keyword, searchType]);

  // 도서 가져오기
  const fetchRecommendedBooks = async (searchTerm) => {
    if (!searchTerm) return;

    try {
      const res = await fetch(
        `${API_BASE_URL}/search?keyword=${encodeURIComponent(searchTerm)}`
      );
      const data = await res.json();

      setBooks(Array.isArray(data.books) ? data.books : []);
    } catch (error) {
      console.error('❌ Book fetch error:', error);
      setBooks([]);
    }
  };

  // 유튜브 영상 가져오기
  const fetchYouTubeVideos = async (searchTerm) => {
    if (!searchTerm) return;

    try {
      setYoutubeLoading(true);
      const videos = await searchYouTubeVideos(searchTerm, 3);
      setYoutubeVideos(videos);
    } catch (error) {
      console.error('❌ YouTube fetch error:', error);
      setYoutubeVideos([]);
    } finally {
      setYoutubeLoading(false);
    }
  };

  // 전체 검색 수행
  const performSearch = async (searchTerm, searchType = '') => {
    try {
      setLoading(true);
      setCurrentPage(1);
      setBookPage(1);

      let jobResults;
      if (searchType === 'hot-job') {
        jobResults = await searchJobsByCode(searchTerm);
      } else {
        jobResults = await searchJobs(searchTerm);
      }

      await fetchRecommendedBooks(searchTerm);
      await fetchYouTubeVideos(searchTerm);

      setSearchResults(jobResults);
      setLoading(false);
    } catch (error) {
      console.error('❌ Search error:', error);
      setSearchResults([]);
      setBooks([]);
      setLoading(false);
    }
  };

  const handlePageChange = (pageNumber) => {
    setCurrentPage(pageNumber);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleNewSearch = (e) => {
    e.preventDefault();
    if (searchKeyword.trim()) {
      navigate(`/search?keyword=${encodeURIComponent(searchKeyword.trim())}`);
    }
  };

  const handleIconClick = () => {
    if (searchKeyword.trim()) {
      navigate(`/search?keyword=${encodeURIComponent(searchKeyword.trim())}`);
    }
  };

  return (
    <div className="search-page">
      <header className="page-header">
        <div className="header-content">
          <div className="page-logo" onClick={() => navigate('/')}>
            <img src={logo} alt="CCPP Logo" className="page-logo-image" />
          </div>
          <button className="home-btn" onClick={() => navigate('/')}>
            홈으로
          </button>
        </div>
      </header>

      {/* 상단 검색창 */}
      <div className="search-section">
        <div className="search-form-container">
          <form onSubmit={handleNewSearch} className="search-form">
            <div className="search-container">
              <input
                type="text"
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                placeholder="키워드 / 직무 검색"
                className="search-input-page"
              />
              <span
                className="material-symbols-outlined search-icon"
                onClick={handleIconClick}
              >
                search
              </span>
            </div>
          </form>
        </div>
      </div>

      <main className="search-content">
        {loading ? (
          <div className="search-loading">
            <div className="loading-spinner"></div>
            <p>검색 중...</p>
          </div>
        ) : (
          <div className="search-content-wrapper">
            {/* 왼쪽 공고 리스트 */}
            <div className="search-results-section">
              <div className="search-results">
                {searchResults.length > 0 ? (
                  <>
                    <div className="job-cards-list">
                      {currentItems.map((job) => (
                        <div key={job.id} className="job-card-horizontal">
                          <div className="job-card-main">
                            <div className="job-header-row">
                              <div className="job-title">
                                <h3>{job.title || job.job_title}</h3>
                              </div>
                              <div className="job-company">
                                <span className="company-tag">
                                  {job.company || job.company_name}
                                </span>
                              </div>
                            </div>

                            <div className="job-details">
                              <span className="location">
                                📍 {job.location || job.region || '위치 정보 없음'}
                              </span>
                              <span className="salary">
                                💰 {job.salary || job.salary_info || '급여 정보 없음'}
                              </span>
                              <span className="career">
                                👨‍💼 {job.career || '경력사항'}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* 공고 페이지네이션 */}
                    {totalPages > 1 && (
                      <div className="pagination">
                        <button
                          className="pagination-btn nav-btn"
                          disabled={currentPage === 1}
                          onClick={() => handlePageChange(currentPage - 1)}
                        >
                          이전
                        </button>

                        {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                          (pageNumber) => (
                            <button
                              key={pageNumber}
                              className={`pagination-btn ${
                                currentPage === pageNumber ? 'active' : ''
                              }`}
                              onClick={() => handlePageChange(pageNumber)}
                            >
                              {pageNumber}
                            </button>
                          )
                        )}

                        <button
                          className="pagination-btn nav-btn"
                          disabled={currentPage === totalPages}
                          onClick={() => handlePageChange(currentPage + 1)}
                        >
                          다음
                        </button>
                      </div>
                    )}

                    <div className="search-keyword search-summary">
                      "<span>{keyword}</span>" 검색 결과 {searchResults.length}개
                    </div>
                  </>
                ) : (
                  <div className="no-results">
                    <div className="no-results-card">
                      <div className="no-results-icon">🔍</div>
                      <h3>검색 결과가 없습니다</h3>
                      <p>다른 키워드로 검색해보세요.</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 도서 목록 섹션 */}
            <div className="books-section">
              <div className="books-card">
                <h3>📚 추천 도서 목록</h3>

                <div className="book-cards-grid">
                  {currentBooks.map((book, index) => {
                    const globalIndex = bookStartIndex + index;

                    let badge = null;
                    let badgeClass = '';
                    if (globalIndex === 0) {
                      badge = '베스트셀러';
                      badgeClass = 'badge-bestseller';
                    } else if (globalIndex === 1) {
                      badge = '인기상승';
                      badgeClass = 'badge-rising';
                    } else if (globalIndex === 2) {
                      badge = '추천';
                      badgeClass = 'badge-recommended';
                    }

                    return (
                      <div
                        key={book.itemId}
                        className="book-card-new"
                        onClick={() =>
                          navigate(`/book/${book.itemId}`, {
                            state: { book },
                          })
                        }
                      >
                        <div className="book-rank-badge">{index + 1}</div>

                        <div className="book-cover-container">
                          {book.cover && (
                            <img
                              src={book.cover}
                              alt={book.title}
                              className="book-cover-new"
                            />
                          )}
                        </div>

                        <div className="book-details-new">
                          <div className="book-title-new" title={book.title}>
                            {truncateBookTitle(book.title, 30)}
                          </div>

                          <div className="book-price-new">{book.price}</div>

                          {badge && (
                            <div className={`book-badge ${badgeClass}`}>
                              {badge}
                            </div>
                          )}
                        </div>

                        <div className="book-arrow">→</div>
                      </div>
                    );
                  })}
                </div>

                {/* 도서 페이지네이션(점) */}
                <div className="book-pagination-dots">
                  {Array.from({ length: totalBookPages }, (_, i) => (
                    <div
                      key={i}
                      className={`dot ${bookPage === i + 1 ? 'active' : ''}`}
                      onClick={() => setBookPage(i + 1)}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* 오른쪽 유튜브 */}
            <div className="youtube-section">
              <div className="youtube-card">
                <h3>🎥 관련 영상</h3>

                {youtubeLoading ? (
                  <div className="youtube-loading">
                    <div className="loading-spinner">🔄</div>
                    <div>영상을 불러오는 중...</div>
                  </div>
                ) : (
                  <div className="youtube-list">
                    {youtubeVideos.length > 0 ? (
                      youtubeVideos.map((video) => (
                        <div key={video.id} className="youtube-item">
                          <div
                            className="youtube-thumbnail"
                            onClick={() => window.open(video.url, '_blank')}
                          >
                            <img
                              src={
                                video.thumbnail ||
                                'https://img.youtube.com/vi/dQw4w9WgXcQ/mqdefault.jpg'
                              }
                              alt={video.title}
                              className="youtube-thumbnail-img"
                            />
                            <div className="play-button">▶️</div>
                          </div>

                          <div className="youtube-info">
                            <div className="youtube-title" title={video.title}>
                              {truncateTitle(video.title, 45)}
                            </div>
                            <div className="youtube-channel">
                              {video.channelTitle}
                            </div>
                            {video.publishedAt && (
                              <div className="youtube-date">
                                {getRelativeTime(video.publishedAt)}
                              </div>
                            )}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="no-youtube">
                        <div>🎥 관련 영상을 찾지 못했어요</div>
                        <div className="no-youtube-sub">
                          다른 키워드로 검색해보세요
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default Search;
