import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate } from "react-router-dom";
import logo from './assets/ccpp-logo.svg';  // ✅ 로고 파일 변경
import './App.css';
import './hotjob.css';
// 실제 파일은 `src/` 루트에 존재하므로 경로를 수정합니다.
import Jobs from './Jobs';
import StackBooks from './StackBooks';
import BookDetail from './BookDetail';
import CategoryJobs from './CategoryJobs';
import Search from './Search';
import jobService from './services/jobService';

function Home() {
	const navigate = useNavigate(); // ✅ 페이지 이동용 hook
	const [hotJobs, setHotJobs] = useState([]);
	const [hotJobsLoading, setHotJobsLoading] = useState(true);
	const [lastUpdateTime, setLastUpdateTime] = useState(null);
	const [searchKeyword, setSearchKeyword] = useState('');

	// 실시간 업데이트 시간 갱신
	const updateLastUpdateTime = () => {
		const now = new Date();
		const currentHour = now.getHours();
		setLastUpdateTime(`${currentHour}시`);
	};

	// PowerBI 대시보드로 이동하는 함수
		const handlePowerBIRedirect = () => {
		const powerBIUrl = "https://app.powerbi.com/reportEmbed?reportId=48049f40-ccab-40f7-81da-39cacb0888c7&autoAuth=true&ctid=8f91900e-dfe5-480a-9a92-56239f989454";
		console.log('🔗 Redirecting to PowerBI Dashboard:', powerBIUrl);
		// 새 탭에서 PowerBI 대시보드 열기
		if (powerBIUrl && powerBIUrl.startsWith('http')) {
			window.open(powerBIUrl, '_blank');
		} else {
			alert('PowerBI 대시보드 URL 설정 X.');
			console.warn('⚠️ PowerBI URL이 설정되지 않음. handlePowerBIRedirect 함수에서 URL을 설정하세요.');
		}
	};
	// 컴포넌트 마운트 시 실시간 HOT 공고 데이터 가져오기
	useEffect(() => {
		const fetchHotJobs = async () => {
			try {
				console.log('🔥 Loading hot jobs from database...');
				console.log('🔍 Current hotJobsLoading state:', hotJobsLoading);
				setHotJobsLoading(true);
				
				// 직접 fetch 테스트
				console.log('🔗 Direct fetch test to:', 'http://localhost:5000/api/jobs/hot');
				
				// 실제 API에서 데이터 가져오기
				const hotJobsData = await jobService.getHotJobs();
				console.log('✅ Received hot jobs:', hotJobsData);
				console.log('📊 Hot jobs type:', typeof hotJobsData);
				console.log('📊 Hot jobs array length:', hotJobsData?.length);
				console.log('🔍 Hot jobs is Array:', Array.isArray(hotJobsData));
				
				if (hotJobsData && hotJobsData.length > 0) {
					console.log('🔍 First hot job:', hotJobsData[0]);
					console.log('🔍 First hot job title:', hotJobsData[0]?.title);
					setHotJobs(hotJobsData);
					console.log('✅ Hot jobs state updated successfully with real data');
				} else {
					console.warn('⚠️ No hot jobs data received or empty array');
					console.log('🔄 Using fallback test data...');
					// API 실패하면 테스트 데이터 사용해서 구별하기
					const fallbackJobsData = [
						{
							id: 1,
							title: "🔥 요양보호사1",
							company: "HOT 공고",
							deadline: "2024-12-31",
							isHot: true,
							location: "전국",
							salary: "협의"
						},
						{
							id: 2,
							title: "🔥 단체급식 조리사1",
							company: "HOT 공고",
							deadline: "2024-12-31",
							isHot: true,
							location: "전국",
							salary: "협의"
						},
						{
							id: 3,
							title: "🔥 사회복지사1",
							company: "HOT 공고", 
							deadline: "2024-12-31",
							isHot: true,
							location: "전국",
							salary: "협의"
						}
					];
					setHotJobs(fallbackJobsData);
					console.log('✅ Using fallback data:', fallbackJobsData);
				}
			} catch (error) {
				console.error('❌ HOT 공고 데이터 로딩 실패:', error);
				console.error('❌ Error details:', error.message);
			
				setHotJobs(fallbackJobsData);
			} finally {
				setHotJobsLoading(false);
				console.log('✅ Loading state set to false');
			}
		};

		// 초기 데이터 로딩
		fetchHotJobs();
		updateLastUpdateTime();

		// 정각마다 공고 데이터 갱신 설정
		const now = new Date();
		const nextHour = new Date(now);
		nextHour.setHours(now.getHours() + 1, 0, 0, 0); // 다음 정각으로 설정
		const timeUntilNextHour = nextHour.getTime() - now.getTime();

		// 첫 번째 정각까지 기다린 후 실행하는 타이머
		const firstUpdateTimeout = setTimeout(() => {
			console.log('🔄 First hourly refresh at exact hour...');
			fetchHotJobs();
			updateLastUpdateTime();

			// 이후 매 정각마다 실행하는 인터벌
			const hotJobsInterval = setInterval(() => {
				console.log('🔄 Hourly refresh at exact hour...');
				fetchHotJobs();
				updateLastUpdateTime();
			}, 3600000); // 1시간 = 3600000ms

			// 전역에 저장해서 cleanup에서 사용
			window.hotJobsInterval = hotJobsInterval;
		}, timeUntilNextHour);

		// 컴포넌트 언마운트 시 타이머 및 인터벌 정리
		return () => {
			clearTimeout(firstUpdateTimeout);
			if (window.hotJobsInterval) {
				clearInterval(window.hotJobsInterval);
				delete window.hotJobsInterval;
			}
		};
	}, []);

	const handleJobClick = (job) => {
		// HOT 공고 클릭 시 직무 코드 기반 검색 페이지로 이동
		const keyword = job.title.replace(/🔥\s*/g, '').trim();
		console.log('🔍 HOT 공고 클릭:', job.title, '-> 검색 키워드:', keyword);
		console.log('🔍 직무 코드:', job.jobCode);
		
		// searchType=hot-job 파라미터 추가로 HOT 공고 클릭임을 표시
		navigate(`/search?keyword=${encodeURIComponent(keyword)}&searchType=hot-job`);
	};

	const runSearch = () => {
		if (searchKeyword.trim()) {
			navigate(`/search?keyword=${encodeURIComponent(searchKeyword.trim())}`);
		}
	};

	const handleSearchSubmit = (e) => {
		e.preventDefault();
		runSearch();
	};

	const handleSearchIconClick = () => {
		runSearch();
	};


	return (
		<div className="App">
			<header className="header">
				<div className="logo">
					{/* ✅ 변경된 로고 적용 */}
					<img src={logo} alt="CCPP Logo" className="logo-image" />
				</div>
				<div className="search-container">
				<form onSubmit={handleSearchSubmit} className="search-form">
					<input 
					type="text" 
					value={searchKeyword}
					onChange={(e) => setSearchKeyword(e.target.value)}
					placeholder="키워드 / 직무 검색" 
					className="search-input" 
					/>

					{/* 인풋 안 오른쪽 돋보기 아이콘 */}
					<span
					className="material-symbols-outlined search-icon"
					onClick={handleSearchIconClick}
					>
					search
					</span>
				</form>
				</div>

			</header>

			<main className="main-content">
				<div className="content-layout">
					<div className="hot-categories-section">
						<h2>실시간 HOT 공고</h2>
						{lastUpdateTime && (
							<div className="update-indicator">
								<span>(📊 HOT 공고 업데이트: {lastUpdateTime})</span>
							</div>
						)}
						{hotJobsLoading ? (
							<div className="loading-placeholder">
								<div className="loading-item"></div>
								<div className="loading-item"></div>
								<div className="loading-item"></div>
							</div>
						) : (
							<>
								<div className="hot-categories-grid">
									{hotJobs && hotJobs.length > 0 ? (
										hotJobs.slice(0, 3).map((job, index) => {
											console.log(`🔍 Rendering hot job ${index}:`, job);
											return (
												<div /* 키워드 카드를 클릭하면 해당 키워드로 검색 페이지로 이동하도록 기능 구현 */
													key={job.id || index} 
													className={`hot-category-card ${index === 0 ? 'top-category' : ''}`}
													onClick={() => handleJobClick(job)}
												>
													<div className="hot-category-header">
														<h3>{job.title || '제목 없음'}</h3>
														<span className="hot-badge">
															{index === 0 ? '🔥 TOP HOT' : `HOT #${index + 1}`}
														</span>
													</div>
													<div className="hot-category-info">
														<span className="job-count">{job.count?.toLocaleString() || 0}건</span>
													</div>
													<div className="category-action">
														<span className="view-jobs">공고보기 →</span>
													</div>
												</div>
											);
										})
									) : (
										<div className="no-data-message">
											<p>🔍 HOT 공고 데이터를 불러오는 중입니다...</p>
											<p>공고 수: {hotJobs?.length || 0}</p>
											<p>로딩 상태: {hotJobsLoading ? '로딩중' : '완료'}</p>
											<p>공고 데이터: {JSON.stringify(hotJobs?.slice(0, 1))}</p>
											<p>API URL: {process.env.REACT_APP_API_BASE_URL || '/api'}</p>
										</div>
									)}
								</div>
							</>
						)}
						<button className="btn more-btn" onClick={handlePowerBIRedirect}>더보기</button>
					</div>
				</div>
			</main>
		</div>
	);
}

function App() {
	return (
		<Router>
			<Routes>
				<Route path="/" element={<Home />} />
			<Route path="/jobs" element={<Jobs />} />
			<Route path="/search" element={<Search />} />
			<Route path="/stack/:stackName" element={<StackBooks />} />
			<Route path="/book/:id" element={<BookDetail />} />
			<Route path="/category/:categoryName" element={<CategoryJobs />} />
			</Routes>
		</Router>
	);
}

export default App;
