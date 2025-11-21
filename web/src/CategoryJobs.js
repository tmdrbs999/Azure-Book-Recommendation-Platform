import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import jobService from './services/jobService';
import './CategoryJobs.css';

function CategoryJobs() {
  const { categoryName } = useParams();
  const navigate = useNavigate();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({});
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    fetchCategoryJobs(1);
  }, [categoryName]);

  const fetchCategoryJobs = async (page) => {
    try {
      setLoading(true);
      const result = await jobService.getJobsByCategory(categoryName, page, 20);
      setJobs(result.data);
      setPagination(result.pagination);
      setCurrentPage(page);
    } catch (error) {
      console.error('카테고리 공고 로딩 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePageChange = (page) => {
    fetchCategoryJobs(page);
  };

  const handleBackClick = () => {
    navigate('/');
  };

  if (loading) {
    return (
      <div className="category-jobs-page">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>공고를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="category-jobs-page">
      <header className="page-header">
        <div className="header-content">
          <h1 className="page-title">{categoryName}</h1>
          <button className="home-btn" onClick={() => navigate('/')}>
            홈으로
          </button>
        </div>
      </header>
      
      <div className="category-info-section">
        <p className="category-info">
          총 {pagination.totalCount}개의 공고가 있습니다
        </p>
      </div>

      <div className="jobs-grid">
        {jobs.map(job => (
          <div key={job.id} className="job-card">
            <div className="job-header">
              <h3 className="job-title">{job.title}</h3>
              {job.isHot && <span className="hot-badge">HOT</span>}
            </div>
            <div className="job-info">
              <div className="company">{job.company}</div>
              <div className="location">{job.location}</div>
              <div className="salary">{job.salary}</div>
            </div>
            <div className="job-tags">
              {job.tags.slice(0, 3).map(tag => (
                <span key={tag} className="job-tag">{tag}</span>
              ))}
            </div>
            <div className="job-date">
              {new Date(job.createdAt).toLocaleDateString('ko-KR')}
            </div>
          </div>
        ))}
      </div>

      {pagination.totalPages > 1 && (
        <div className="pagination">
          <button 
            className="page-btn"
            disabled={!pagination.hasPrevPage}
            onClick={() => handlePageChange(currentPage - 1)}
          >
            이전
          </button>
          
          <div className="page-numbers">
            {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
              const pageNum = Math.max(1, currentPage - 2) + i;
              if (pageNum <= pagination.totalPages) {
                return (
                  <button
                    key={pageNum}
                    className={`page-number ${pageNum === currentPage ? 'active' : ''}`}
                    onClick={() => handlePageChange(pageNum)}
                  >
                    {pageNum}
                  </button>
                );
              }
              return null;
            })}
          </div>
          
          <button 
            className="page-btn"
            disabled={!pagination.hasNextPage}
            onClick={() => handlePageChange(currentPage + 1)}
          >
            다음
          </button>
        </div>
      )}
    </div>
  );
}

export default CategoryJobs;