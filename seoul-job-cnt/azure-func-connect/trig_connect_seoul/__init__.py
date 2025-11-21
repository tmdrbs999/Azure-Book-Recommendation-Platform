import logging
import azure.functions as func
import requests
import pandas as pd
from datetime import datetime
from azure.storage.blob import BlobServiceClient
import os
import re
import tempfile
import json
from urllib3.util.retry import Retry
from requests.adapters import HTTPAdapter


# === 환경 설정 상수 ===
STATE_BLOB_NAME = "state/current_start_index.json" # 현재 인덱스를 저장할 Blob 파일 경로
CHUNK_SIZE = 100 # 한 번의 함수 실행(1분) 시 가져올 레코드 수 <-- 수정됨 (100)
DEFAULT_START_INDEX = 1 # 시작 인덱스 (API의 첫 페이지)

# =========================================================================
# === 1. Session 생성 함수 (API 재시도 로직) ===
# =========================================================================
def build_session(total_retries: int = 3, backoff: float = 1.0) -> requests.Session:
    """HTTP 요청 세션을 설정하고 재시도 정책을 적용합니다."""
    s = requests.Session()
    # 429(Rate Limit), 5xx 서버 에러 발생 시 재시도하도록 설정
    retries = Retry(total=total_retries, backoff_factor=backoff, status_forcelist=[429, 500, 502, 503, 504])
    adapter = HTTPAdapter(max_retries=retries)
    s.mount('https://', adapter)
    s.mount('http://', adapter)
    return s


# =========================================================================
# === 2. JSON/텍스트 파싱 유틸 (기존 로직 유지) ===
# =========================================================================
def extract_by_path(obj, path: str):
    """JSON 객체에서 '.' 경로를 이용해 값을 추출합니다."""
    if not path:
        return obj
    cur = obj
    for p in path.split('.'):
        if isinstance(cur, dict) and p in cur:
            cur = cur[p]
        else:
            return None
    return cur

def ensure_list(x):
    """입력값을 리스트로 변환합니다."""
    if x is None:
        return []
    if isinstance(x, list):
        return x
    return [x]

def parse_wage(text):
    """시급/월급 문자열을 파싱하여 금액(KRW)을 추출합니다."""
    # (원래의 상세한 파싱 로직 유지)
    if not isinstance(text, str):
        return {'wage_type': None, 'wage_value_krw': None, 'wage_raw': text}
    s = text.strip()
    m = re.search(r'\(?(월급|시급)\)?\s*[/\\]?\s*([0-9,\.]+)\s*(만원|원)?', s)
    if m:
        wtype, num, unit = m.group(1), m.group(2), m.group(3) or '원'
        try:
            num_val = int(float(num.replace(',', '')))
        except Exception:
            num_val = None
        value = num_val * 10000 if unit == '만원' else num_val
        return {'wage_type': wtype, 'wage_value_krw': value, 'wage_raw': text}
    m2 = re.search(r'([0-9,\.]+)\s*(만원|원)', s)
    if m2:
        try:
            num_val = int(float(m2.group(1).replace(',', '')))
        except Exception:
            num_val = None
        unit = m2.group(2)
        value = num_val * 10000 if unit == '만원' else num_val
        wtype = '월급' if '월' in s else ('시급' if '시' in s else None)
        return {'wage_type': wtype, 'wage_value_krw': value, 'wage_raw': text}
    return {'wage_type': None, 'wage_value_krw': None, 'wage_raw': text}

def parse_gui_ln(gui):
    """GUI_LN 문자열에서 지역(region)과 경력(career)을 추출합니다."""
    # (원래의 상세한 파싱 로직 유지)
    if not isinstance(gui, str):
        return {'region': None, 'career': None, 'gui_raw': gui}
    parts = [p.strip() for p in gui.split('/')]
    region = parts[1] if len(parts) >= 2 else None
    career = parts[2] if len(parts) >= 3 else None
    return {'region': region, 'career': career, 'gui_raw': gui}


# =========================================================================
# === 3. 상태 관리 (Load/Save Start Index) ===
# =========================================================================
def get_blob_client(conn_str: str, container_name: str, blob_name: str):
    """Blob Client 객체를 반환합니다."""
    blob_service_client = BlobServiceClient.from_connection_string(conn_str)
    container_client = blob_service_client.get_container_client(container_name)
    try:
        container_client.create_container() # 컨테이너가 없으면 생성
    except Exception:
        pass
    return container_client.get_blob_client(blob_name)

def load_start_index(blob_client):
    """Blob Storage에서 마지막으로 성공한 start_index를 로드합니다."""
    try:
        download_stream = blob_client.download_blob()
        data = json.loads(download_stream.readall())
        start_index = data.get('next_start_index', DEFAULT_START_INDEX)
        logging.info(f"💾 상태 로드 성공: 다음 시작 인덱스 = {start_index}")
        return start_index
    except Exception as e:
        # 파일이 없거나(404) 파싱 오류 발생 시 기본값 반환
        logging.warning(f"⚠️ 상태 로드 실패 또는 파일 없음: {e}. 기본값 ({DEFAULT_START_INDEX})으로 시작합니다.")
        return DEFAULT_START_INDEX

def save_start_index(blob_client, next_start_index: int):
    """다음 호출을 위한 start_index를 Blob Storage에 저장합니다."""
    state_data = {'next_start_index': next_start_index, 'last_updated': datetime.now().isoformat()}
    blob_client.upload_blob(json.dumps(state_data), overwrite=True)
    logging.info(f"💾 상태 저장 성공: 다음 시작 인덱스 = {next_start_index}")


# =========================================================================
# === 4. 단일 청크 API 호출 (Industry 코드 제거) ===
# =========================================================================
# industry 파라미터 제거
def fetch_one_chunk_of_jobs(session: requests.Session, api_key: str, start_index: int, chunk_size: int = CHUNK_SIZE):
    """지정된 start_index부터 chunk_size만큼의 레코드만 가져옵니다."""
    
    end_index = start_index + chunk_size - 1
    # URL에서 // 다음에 있던 {industry} 부분을 제거했습니다.
    url = f"http://openapi.seoul.go.kr:8088/{api_key}/json/GetJobInfo/{start_index}/{end_index}/" 
    
    logging.info(f"🚀 API 요청 범위 (전체 산업): Start={start_index}, End={end_index}")

    try:
        resp = session.get(url, timeout=15)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        logging.error(f"❌ API 요청 실패 (Start={start_index}): {e}")
        return [], start_index # 실패 시 현재 인덱스를 유지하고 종료
    
    records = extract_by_path(data, "GetJobInfo.row")
    records = ensure_list(records)
    
    # 다음 시작 인덱스를 계산합니다.
    next_start_index = start_index + len(records)
    
    if not records:
        logging.info("⭐ API 응답에 데이터가 없습니다. 스트림의 끝일 수 있습니다.")
    
    return records, next_start_index


# =========================================================================
# === 5. 데이터 정제 (기존 로직 유지) ===
# =========================================================================
def clean_dataframe(df: pd.DataFrame, convert_monthly: bool = True, hours_per_month: int = 209) -> pd.DataFrame:
    """데이터프레임을 정제하고 임금 정보 등을 파싱합니다."""
    # (원래의 상세한 정제 로직 유지)
    keep = [
        'CMPNY_NM', 'JO_SJ', 'HOPE_WAGE', 'GUI_LN',
        'RCRIT_JSSFC_CMMN_CODE_SE', 'JOBCODE_NM', 'CAREER_CND_CMMN_CODE_SE', 'ACDMCR_CMMN_CODE_SE'
    ]
    existing = [c for c in keep if c in df.columns]
    out = df[existing].copy()
    out = out.rename(columns={
        'CMPNY_NM': 'company',
        'JO_SJ': 'job_title',
        'HOPE_WAGE': 'hope_wage',
        'GUI_LN': 'gui_ln'
    })

    wage_df = pd.DataFrame(out['hope_wage'].fillna('').apply(parse_wage).tolist(), index=out.index)
    gui_df = pd.DataFrame(out['gui_ln'].fillna('').apply(parse_gui_ln).tolist(), index=out.index)

    out = pd.concat([out, wage_df, gui_df], axis=1)

    if convert_monthly:
        def to_monthly(row):
            if row.get('wage_type') == '시급' and row.get('wage_value_krw'):
                return int(row['wage_value_krw'] * hours_per_month)
            if row.get('wage_type') == '월급' and row.get('wage_value_krw'):
                return int(row['wage_value_krw'])
            return None
        out['wage_value_monthly'] = out.apply(to_monthly, axis=1)

    # RCRIT_JSSFC_CMMN_CODE_SE 컬럼 처리
    def process_rcrit_code(code):
        if pd.isna(code) or code == '':
            return None
        code_str = str(code).strip()
        if code_str.isdigit():
            if len(code_str) == 5:
                code_str = '0' + code_str
            if len(code_str) > 2:
                code_str = code_str[:-2]
        return code_str

    if 'RCRIT_JSSFC_CMMN_CODE_SE' in out.columns:
        out['RCRIT_JSSFC_CMMN_CODE_SE'] = out['RCRIT_JSSFC_CMMN_CODE_SE'].apply(process_rcrit_code)

    # wage_type 추론
    def infer_wage_type(row):
        wt = row.get('wage_type')
        if wt is None or (isinstance(wt, float) and pd.isna(wt)) or (isinstance(wt, str) and wt.strip() == ''):
            v = row.get('wage_value_krw')
            try:
                vnum = int(float(v)) if v is not None else 0
            except Exception:
                vnum = 0
            if vnum // 1000000 == 0:
                return "공고 확인"
            else:
                return "연봉"
        return wt

    out['wage_type'] = out.apply(infer_wage_type, axis=1)

    # 최종 필터링 컬럼만 남기기
    filtered_cols = [
        'company', 'job_title', 'wage_type', 'wage_value_krw', 'region', 'career',
        'RCRIT_JSSFC_CMMN_CODE_SE', 'JOBCODE_NM', 'CAREER_CND_CMMN_CODE_SE', 'ACDMCR_CMMN_CODE_SE',
        'wage_value_monthly'
    ]
    for c in filtered_cols:
        if c not in out.columns:
            out[c] = None
    
    return out[filtered_cols].copy()


# =========================================================================
# === 6. Azure Function Main (Timer Trigger) (Industry 코드 제거) ===
# =========================================================================
def main(mytimer: func.TimerRequest) -> None:
    """1분마다 실행되는 타이머 트리거 메인 함수입니다."""
    utc_timestamp = datetime.utcnow().isoformat()
    logging.info(f'Python Timer Trigger 시작: {utc_timestamp}')
    
    # API 요청 URL 구성에 필요하지 않은 industry 변수 선언/검증 로직 삭제

    try:
        # (1) 환경 변수 및 설정 로드
        # industry 변수 삭제
        api_key = os.getenv("API_KEY", "인증키")
        blob_conn_str = os.getenv("AzureWebJobsStorage")
        container_name = os.getenv("BLOB_CONTAINER_NAME", "seoul-job-ct")
        
        if not blob_conn_str:
            logging.error("❌ AzureWebJobsStorage 연결 문자열이 설정되지 않았습니다.")
            return

        # (2) 상태 관리 클라이언트 생성 및 현재 시작 인덱스 로드
        state_blob_client = get_blob_client(blob_conn_str, container_name, STATE_BLOB_NAME)
        current_start_index = load_start_index(state_blob_client)
        
        # (3) API 호출 세션 생성
        session = build_session()
        
        # (4) 단일 청크 데이터 가져오기 (100건)
        # fetch_one_chunk_of_jobs 호출 시 industry 인수를 제거했습니다.
        records, next_start_index = fetch_one_chunk_of_jobs(
            session, api_key, current_start_index, CHUNK_SIZE
        )

        if not records:
            # 데이터가 없으면 현재 인덱스를 유지하고 (다음 실행을 위해) 종료
            logging.info("⭐ 이번 호출에서 새 레코드가 발견되지 않았습니다. 현재 인덱스를 유지하고 종료합니다.")
            return

        # (5) 데이터프레임 생성 및 정제
        df = pd.DataFrame(records)
        filtered_df = clean_dataframe(df)
        
        # (6) CSV 생성 및 Blob 업로드 (새 파일로 저장)
        # 파일 경로에서 industry 폴더명 대신 'all' 또는 현재는 빈 문자열을 사용합니다.
        # 데이터가 필터링되지 않았으므로 'all'을 사용하거나, 파일 구조에 맞게 조정해야 합니다.
        # 여기서는 파일명 충돌을 피하기 위해 임시로 'all_jobs' 폴더를 가정합니다.
        file_name = f"data/all_jobs/seoul_jobs_{current_start_index}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
        
        output_blob_client = get_blob_client(blob_conn_str, container_name, file_name)
        
        # CSV 데이터를 메모리에서 바로 Blob으로 업로드
        csv_bytes = filtered_df.to_csv(index=False, encoding="utf-8-sig").encode("utf-8-sig")
        output_blob_client.upload_blob(csv_bytes, overwrite=True)
        logging.info(f"✅ Blob 업로드 완료: {file_name} ({len(filtered_df)}건)")

        # (7) 다음 시작 인덱스 저장 (성공적으로 데이터를 가져오고 저장한 경우에만 업데이트)
        save_start_index(state_blob_client, next_start_index)
        
    except Exception as e:
        logging.error(f"❌ 전체 프로세스 오류 발생: {e}")

    logging.info('Python Timer Trigger 완료.')