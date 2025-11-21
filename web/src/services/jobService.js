// JobService - 실제 백엔드 API 연결
const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || '/api';

class JobService {
  // Hot 공고 데이터 가져오기
  async getHotJobs() {
    console.log('🚀 Starting getHotJobs...');
    
    try {
      const apiUrl = `${API_BASE_URL}/jobs/hot`;
      console.log('🔥 Fetching hot jobs from:', apiUrl);
      console.log('🔗 API_BASE_URL:', API_BASE_URL);
      
      // Preflight 요청 확인을 위한 OPTIONS 요청
      try {
        const optionsResponse = await fetch(apiUrl, { method: 'OPTIONS' });
        console.log('✅ OPTIONS preflight status:', optionsResponse.status);
      } catch (optionsError) {
        console.log('❌ OPTIONS preflight failed:', optionsError.message);
      }
      
      // 가장 간단한 fetch 방식
      console.log('📡 Starting actual GET request...');
      const response = await fetch(apiUrl, {
        method: 'GET',
        mode: 'cors'  // 명시적 CORS 모드
      });
      
      console.log('📡 Response received!');
      console.log('📡 Response status:', response.status);
      console.log('📡 Response ok:', response.ok);
      console.log('📡 Response headers:', response.headers);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Response error text:', errorText);
        throw new Error(`HTTP error! status: ${response.status}, text: ${errorText}`);
      }
      
      const result = await response.json();
      console.log('🔍 Full API response:', result);
      console.log('📊 Data array:', result.data);
      console.log('📊 Data length:', result.data?.length);
      
      if (result.success && result.data && result.data.length > 0) {
        console.log('✅ Successfully fetched hot jobs:', result.data);
        return result.data;
      } else {
        console.warn('⚠️ API returned unsuccessful result or empty data:', result);
        return [];
      }
      
    } catch (error) {
      console.error('❌ Error fetching hot jobs:', error);
      console.error('❌ Error details:', error.message);
      console.error('❌ Error name:', error.name);
      console.error('❌ Error stack:', error.stack);
      
      // 네트워크 오류 상세 분석
      if (error.message.includes('Failed to fetch')) {
        console.error('🚫 CORS/Network Error Details:');
        console.error('   - Check if backend server is running on http://localhost:5000');
        console.error('   - Check CORS configuration');
        console.error('   - Check firewall/antivirus blocking');
        
        // 직접 fetch로 테스트
        try {
          console.log('🔍 Testing direct fetch...');
          const testResponse = await fetch('http://localhost:5000/api/health');
          console.log('🔍 Health check response:', testResponse.status);
        } catch (testError) {
          console.error('🔍 Health check failed:', testError.message);
        }
      }
      
      // TypeError는 CORS 문제일 가능성이 높음
      if (error.name === 'TypeError') {
        console.error('🚫 TypeError detected - likely CORS issue');
        console.error('   - Ensure backend CORS allows http://localhost:3000');
        console.error('   - Check browser console for CORS error details');
      }
      
      // API 실패 시 빈 배열 반환 (fallback은 App.js에서 처리)
      console.log('🚫 API call failed - returning empty array for fallback handling');
      return [];
    }
  }

  // 실시간 HOT 직종 카테고리 가져오기 (새로운 쿼리 기반)
  async getTopCategories() {
    try {
      const apiUrl = `${API_BASE_URL}/jobs/categories/top`;
      console.log('🔥 Fetching real-time HOT job categories from:', apiUrl);
      console.log('🔗 API_BASE_URL:', API_BASE_URL);
      
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'omit' // CORS 문제 방지
      });
      
      console.log('📡 Response status:', response.status);
      console.log('📡 Response ok:', response.ok);
      console.log('📡 Response headers:', response.headers);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Response error text:', errorText);
        throw new Error(`HTTP error! status: ${response.status}, text: ${errorText}`);
      }
      
      const result = await response.json();
      console.log('🔍 Full API response:', result);
      console.log('📊 Data array:', result.data);
      console.log('📊 Data length:', result.data?.length);
      
      if (result.success && result.data) {
        console.log('✅ Successfully fetched HOT categories:', result.data);
        console.log('📊 Last updated:', result.lastUpdated);
        console.log('🔍 First item job_name:', result.data[0]?.job_name);
        return result.data;
      } else {
        console.warn('⚠️ API returned unsuccessful result:', result);
        throw new Error(result.message || 'Failed to fetch HOT categories');
      }
      
    } catch (error) {
      console.error('❌ Error fetching HOT categories:', error);
      console.error('❌ Error details:', error.message);
      console.error('❌ Error stack:', error.stack);
      console.error('❌ Error name:', error.name);
      
      // 네트워크 오류인지 확인
      if (error.message.includes('Failed to fetch')) {
        console.error('🚫 Network error - backend server may not be running on port 5000');
        console.error('🔗 Please check if backend server is running: http://localhost:5000/api/health');
      }
      
      // 실제 데이터베이스 오류 시 빈 배열 반환
      console.log('🚫 Database connection failed - returning empty array');
      return [];
    }
  }

  // 특정 카테고리의 공고 목록 가져오기
  async getJobsByCategory(categoryName, page = 1, limit = 20) {
    try {
      console.log(`🔍 Fetching jobs for category: ${categoryName}`);
      const response = await fetch(`${API_BASE_URL}/jobs/category/${encodeURIComponent(categoryName)}?page=${page}&limit=${limit}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (result.success) {
        console.log('✅ Successfully fetched category jobs:', result.data);
        return result;
      } else {
        throw new Error(result.message || 'Failed to fetch category jobs');
      }
      
    } catch (error) {
      console.error('❌ Error fetching category jobs:', error);
      
      // 폴백 데이터
      return {
        success: true,
        data: [],
        pagination: {
          currentPage: 1,
          totalPages: 1,
          totalCount: 0,
          hasNextPage: false,
          hasPrevPage: false
        },
        category: categoryName
      };
    }
  }

  // 특정 공고 상세 정보 가져오기
  async getJobDetail(jobId) {
    try {
      console.log(`📄 Fetching job detail for ID: ${jobId}`);
      const response = await fetch(`${API_BASE_URL}/jobs/${jobId}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (result.success) {
        return result.data;
      } else {
        throw new Error(result.error || 'Failed to fetch job detail');
      }
      
    } catch (error) {
      console.error('❌ Error fetching job detail:', error);
      
      // 폴백 데이터
      return {
        id: jobId,
        title: "🔥 Sample Job Position",
        company: "Sample Company",
        deadline: "2024-12-31",
        isHot: true,
        location: "서울",
        salary: "협의",
        tags: ["JavaScript", "React"],
        description: "상세 정보를 불러올 수 없습니다.",
        requirements: "백엔드 서버를 확인해주세요.",
        createdAt: new Date()
      };
    }
  }

  // 키워드로 채용공고 검색
  async searchJobs(keyword) {
    try {
      console.log(`🔍 Searching jobs with keyword: ${keyword}`);
      const response = await fetch(`${API_BASE_URL}/jobs/search?keyword=${encodeURIComponent(keyword)}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (result.success) {
        console.log('✅ Successfully fetched search results:', result.data);
        return result.data;
      } else {
        throw new Error(result.message || 'Failed to search jobs');
      }
      
    } catch (error) {
      console.error('❌ Error searching jobs:', error);
      
      // 백엔드 연결 실패 시 임시 검색 결과 반환
      console.log('🔄 Using fallback search data...');
      return this.getFallbackSearchResults(keyword);
    }
  }

  // 검색 실패 시 대체 데이터
  getFallbackSearchResults(keyword) {
    const allJobs = [
      {
        id: 1,
        job_title: "간병인 모집 - 경력무관 환영",
        company_name: "다솜요양원",
        region: "서울시 강남구",
        salary_info: "월 250만원",
        close_date: "2024-12-31",
        employment_type: "정규직",
        experience_level: "경력무관"
      },
      {
        id: 2,
        job_title: "요양보호사 급구 - 야간근무 가능자",
        company_name: "햇살요양센터",
        region: "경기도 성남시",
        salary_info: "시급 12,000원",
        close_date: "2024-12-25",
        employment_type: "파트타임",
        experience_level: "경력 1년 이상"
      },
      {
        id: 3,
        job_title: "제조업체 생산직 모집",
        company_name: "한국제조(주)",
        region: "인천시 남동구",
        salary_info: "월 280만원",
        close_date: "2024-12-28",
        employment_type: "정규직",
        experience_level: "신입/경력"
      },
      {
        id: 4,
        job_title: "택배 운전기사 모집",
        company_name: "빠른배송",
        region: "부산시 해운대구",
        salary_info: "월 320만원",
        close_date: "상시모집",
        employment_type: "계약직",
        experience_level: "경력 2년 이상"
      },
      {
        id: 5,
        job_title: "간호조무사 채용공고",
        company_name: "건강한병원",
        region: "대구시 중구",
        salary_info: "월 230만원",
        close_date: "2024-12-30",
        employment_type: "정규직",
        experience_level: "면허 보유자"
      },
      {
        id: 6,
        job_title: "건설현장 기능공 모집",
        company_name: "든든건설",
        region: "광주시 서구",
        salary_info: "일급 15만원",
        close_date: "2024-12-29",
        employment_type: "일용직",
        experience_level: "경력 3년 이상"
      }
    ];

    // 키워드와 관련된 결과 필터링
    const filtered = allJobs.filter(job => 
      job.job_title.toLowerCase().includes(keyword.toLowerCase()) ||
      job.company_name.toLowerCase().includes(keyword.toLowerCase()) ||
      job.region.toLowerCase().includes(keyword.toLowerCase())
    );

    // 필터된 결과가 없으면 전체 결과 반환
    return filtered.length > 0 ? filtered : allJobs.slice(0, 3);
  }

  // 🔥 HOT 공고 클릭시 직무 코드 기반 검색
  async searchJobsByCode(keyword) {
    try {
      console.log(`🔥 Searching jobs by code for keyword: ${keyword}`);
      
      const response = await fetch(`${API_BASE_URL}/jobs/by-code?keyword=${encodeURIComponent(keyword)}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'omit'
      });
      
      console.log('📡 Response status:', response.status);
      console.log('📡 Response ok:', response.ok);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Response error text:', errorText);
        throw new Error(`HTTP error! status: ${response.status}, text: ${errorText}`);
      }
      
      const result = await response.json();
      console.log('🔍 Full API response:', result);
      console.log('📊 Data array:', result.data);
      console.log('📊 Data length:', result.data?.length);
      console.log('🔥 Job code:', result.jobCode);
      
      if (result.success && result.data) {
        console.log('✅ Successfully fetched jobs by code:', result.data);
        return result.data;
      } else {
        console.warn('⚠️ API returned unsuccessful result:', result);
        return [];
      }
      
    } catch (error) {
      console.error('❌ Error searching jobs by code:', error);
      console.error('❌ Error details:', error.message);
      
      // 네트워크 오류인지 확인
      if (error.message.includes('Failed to fetch')) {
        console.error('🚫 Network error - backend server may not be running on port 5000');
        console.error('🔗 Please check if backend server is running: http://localhost:5000/api/health');
      }
      
      return [];
    }
  }

  // 헬스 체크 (백엔드 연결 상태 확인)
  async healthCheck() {
    try {
      const response = await fetch(`${API_BASE_URL}/health`);
      const result = await response.json();
      console.log('🏥 Backend health check:', result);
      return result.status === 'OK';
    } catch (error) {
      console.error('❌ Backend health check failed:', error);
      return false;
    }
  }
}

// 싱글톤 인스턴스 생성
const jobService = new JobService();

// 개별 함수들을 export
export const getHotJobs = () => jobService.getHotJobs();
export const getJobDetails = (id) => jobService.getJobDetails(id);
export const searchJobs = (keyword) => jobService.searchJobs(keyword);
export const searchJobsByCode = (keyword) => jobService.searchJobsByCode(keyword); // 🔥 HOT 공고용 검색

export default jobService;