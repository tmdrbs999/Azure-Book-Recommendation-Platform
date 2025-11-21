// youtubeService.js
const YOUTUBE_API_KEY = process.env.REACT_APP_YOUTUBE_API_KEY; // .env 파일에서 가져올 API 키
const YOUTUBE_API_BASE_URL = 'https://www.googleapis.com/youtube/v3';

/**
 * 유튜브에서 검색 키워드에 맞는 영상들을 가져오는 함수
 * @param {string} searchKeyword - 검색할 키워드
 * @param {number} maxResults - 최대 결과 개수 (기본값: 6)
 * @returns {Array} 유튜브 영상 배열
 */
export const searchYouTubeVideos = async (searchKeyword, maxResults = 6) => {
  if (!searchKeyword) {
    console.warn('🚨 YouTube 검색 키워드가 없습니다.');
    return [];
  }

  // API 키가 없을 때 더미 데이터 반환
  if (!YOUTUBE_API_KEY) {
    console.warn('🚨 YouTube API 키가 설정되지 않았습니다. 더미 데이터를 반환합니다.');
    return getDummyVideos(searchKeyword);
  }

  try {
    console.log(`🎥 YouTube 검색 시작: "${searchKeyword}"`);
    
    // 한국어 검색을 위해 키워드 조합
    const searchQuery = `${searchKeyword} 직업 취업 교육 가이드`;
    
    const response = await fetch(
      `${YOUTUBE_API_BASE_URL}/search?` +
      `part=snippet&` +
      `q=${encodeURIComponent(searchQuery)}&` +
      `type=video&` +
      `maxResults=${maxResults}&` +
      `order=relevance&` +
      `regionCode=KR&` +
      `relevanceLanguage=ko&` +
      `key=${YOUTUBE_API_KEY}`
    );

    if (!response.ok) {
      throw new Error(`YouTube API 요청 실패: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.items || data.items.length === 0) {
      console.warn('🚨 YouTube 검색 결과가 없습니다.');
      return getDummyVideos(searchKeyword);
    }

    // YouTube 데이터를 우리 앱에서 사용할 형태로 변환
    const videos = data.items.map(item => ({
      id: item.id.videoId,
      title: item.snippet.title,
      channelTitle: item.snippet.channelTitle,
      thumbnail: item.snippet.thumbnails.medium?.url || item.snippet.thumbnails.default?.url,
      description: item.snippet.description,
      publishedAt: item.snippet.publishedAt,
      url: `https://www.youtube.com/watch?v=${item.id.videoId}`
    }));

    console.log(`✅ YouTube 영상 ${videos.length}개 가져오기 완료`);
    return videos;

  } catch (error) {
    console.error('❌ YouTube API 에러:', error);
    return getDummyVideos(searchKeyword);
  }
};

/**
 * API 키가 없거나 에러가 발생했을 때 사용할 더미 데이터
 * @param {string} searchKeyword - 검색 키워드
 * @returns {Array} 더미 유튜브 영상 배열
 */
const getDummyVideos = (searchKeyword) => {
  const dummyVideos = [
    {
      id: 'dummy1',
      title: `${searchKeyword} 직업 소개 및 취업 가이드`,
      channelTitle: '취업 도우미 채널',
      thumbnail: 'https://img.youtube.com/vi/dQw4w9WgXcQ/mqdefault.jpg',
      description: `${searchKeyword} 관련 직업에 대한 상세한 설명과 취업 준비 방법을 알려드립니다.`,
      publishedAt: new Date().toISOString(),
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
    },
    {
      id: 'dummy2',
      title: `${searchKeyword} 면접 준비 완벽 가이드`,
      channelTitle: '커리어 멘토',
      thumbnail: 'https://img.youtube.com/vi/dQw4w9WgXcQ/mqdefault.jpg',
      description: `${searchKeyword} 분야 면접에서 자주 나오는 질문과 답변 방법을 소개합니다.`,
      publishedAt: new Date().toISOString(),
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
    },
    {
      id: 'dummy3',
      title: `${searchKeyword} 이력서 작성법과 포트폴리오 팁`,
      channelTitle: '취업 성공 TV',
      thumbnail: 'https://img.youtube.com/vi/dQw4w9WgXcQ/mqdefault.jpg',
      description: `${searchKeyword} 분야에서 눈에 띄는 이력서 작성법과 포트폴리오 준비 방법을 알려드립니다.`,
      publishedAt: new Date().toISOString(),
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
    }
  ];

  return dummyVideos;
};

/**
 * 유튜브 영상 제목을 적절한 길이로 자르는 함수
 * @param {string} title - 원본 제목
 * @param {number} maxLength - 최대 길이 (기본값: 50)
 * @returns {string} 잘린 제목
 */
export const truncateTitle = (title, maxLength = 50) => {
  if (!title) return '';
  
  if (title.length <= maxLength) {
    return title;
  }
  
  return title.substring(0, maxLength) + '...';
};

/**
 * 유튜브 영상 게시일을 상대적 시간으로 변환하는 함수
 * @param {string} publishedAt - ISO 날짜 문자열
 * @returns {string} 상대적 시간 (예: "3일 전")
 */
export const getRelativeTime = (publishedAt) => {
  if (!publishedAt) return '';
  
  const now = new Date();
  const published = new Date(publishedAt);
  const diffInMs = now.getTime() - published.getTime();
  const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));
  
  if (diffInDays === 0) {
    const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
    if (diffInHours === 0) {
      const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
      return `${diffInMinutes}분 전`;
    }
    return `${diffInHours}시간 전`;
  } else if (diffInDays === 1) {
    return '1일 전';
  } else if (diffInDays < 30) {
    return `${diffInDays}일 전`;
  } else if (diffInDays < 365) {
    const diffInMonths = Math.floor(diffInDays / 30);
    return `${diffInMonths}개월 전`;
  } else {
    const diffInYears = Math.floor(diffInDays / 365);
    return `${diffInYears}년 전`;
  }
};