// 백엔드 API를 통한 Job 데이터 서비스 (권장 방식)
class JobService {
  static apiBaseUrl = process.env.REACT_APP_API_BASE_URL || 'http://localhost:3001/api';

  // API 요청 헬퍼 함수
  static async apiRequest(endpoint, options = {}) {
    try {
      const response = await fetch(`${this.apiBaseUrl}${endpoint}`, {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        ...options,
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('API request error:', error);
      throw error;
    }
  }

  // 실시간 Hot 공고 가져오기
  static async getHotJobs() {
    try {
      // 백엔드 API 호출: GET /api/jobs/hot
      const data = await this.apiRequest('/jobs/hot');
      return data.jobs || data; // API 응답 구조에 따라 조정
      
    } catch (error) {
      console.error('Error fetching hot jobs:', error);
      
      // API 실패 시 폴백 데이터
      return this.getFallbackJobs();
    }
  }

  // 특정 공고 상세 정보 가져오기
  static async getJobById(id) {
    try {
      // 백엔드 API 호출: GET /api/jobs/:id
      const data = await this.apiRequest(`/jobs/${id}`);
      return data.job || data; // API 응답 구조에 따라 조정
      
    } catch (error) {
      console.error('Error fetching job by id:', error);
      return null;
    }
  }

  // 폴백 데이터 (API 연결 실패 시 사용)
  static getFallbackJobs() {
    return [
      { 
        id: 1, 
        title: "시니어 풀스택 개발자", 
        company: "네이버", 
        deadline: "2025.12.31", 
        isHot: true,
        location: "판교",
        salary: "연봉 6000~8000만원",
        tags: ["React", "Node.js", "AWS"]
      },
      { 
        id: 2, 
        title: "프론트엔드 리드 개발자", 
        company: "카카오", 
        deadline: "2025.12.25", 
        isHot: true,
        location: "판교",
        salary: "연봉 7000~9000만원",
        tags: ["React", "TypeScript", "Redux"]
      },
      { 
        id: 3, 
        title: "백엔드 개발자", 
        company: "토스", 
        deadline: "2025.12.20", 
        isHot: true,
        location: "서울",
        salary: "연봉 5000~7000만원",
        tags: ["Java", "Spring", "Kubernetes"]
      }
    ];
  }
}

export default JobService;