import azure.functions as func
import logging
import requests
import pandas as pd
import json
import os
import io
from azure.storage.blob import BlobServiceClient
from azure.eventhub import EventHubProducerClient, EventData
from datetime import datetime
import time
import numpy as np
import re
from pytz import timezone


# # 한국 시간대로 현재 날짜와 시간 가져오기
# now_korea = datetime.now(timezone('Asia/Seoul'))

app = func.FunctionApp()  # ✅ 최신 구조에서 필수

# 환경 변수 (local.settings.json 또는 Application Settings)
API_KEY = os.getenv("API_KEY")
BASE_URL = "https://openapi.gg.go.kr/GGJOBABARECRUSTM"
STORAGE_CONN_STR = os.getenv("AzureWebJobsStorage")
EVENTHUB_CONN_STR = os.getenv("EVENTHUB_CONN_STR")
# EVENTHUB_NAME = os.getenv("EVENTHUB_NAME", "events-job")
EVENTHUB_NAME = os.getenv("EVENTHUB_NAME", "2dt-1st-team1-event-ggjob")


# ================================================
# 전처리 함수
# ================================================

# 급여조건 분리
def parse_salary(salary_text: str):
    # 아예 비어있는 경우 공고확인
    if pd.isna(salary_text):
        return pd.Series([None, "공고확인"])

    text = str(salary_text).strip()

    # 1️⃣ 단위 인식
    if "시급" in text:
        unit = "시급"
    elif "일급" in text:
        unit = "일급"
    elif "월급" in text:
        unit = "월급"
    elif "연봉" in text:
        unit = "연봉"
    elif "내규" in text:
        unit = "내규"
    else:
        unit = "연봉"
        # 조건 추가해야할 수도?

    # 2️⃣ 숫자 추출
    nums = re.findall(r"\d+", text)
    nums = [int(n) for n in nums]

    if not nums:
        # 숫자가 없는 경우 (회사내규 등)
        return pd.Series([np.nan, unit])

    # 3️⃣ 금액 계산 로직
    if "~" in text:
        # 범위인 경우 -> 평균값(중위값)
        value = np.mean(nums)
    elif "이하" in text:
        # 이하 -> 최대값
        value = max(nums)
    elif "이상" in text or "초과" in text:
        # 이상/초과 -> 최소값
        value = min(nums)
    else:
        # 단일 금액
        value = nums[0]

    # # 4️⃣ 단위 변환 (원 -> 만원)
    # if "원" in text and "만원" not in text:
    #     value = value / 10000  # 원 -> 만원

    # 4️⃣ 단위 변환 (만원 -> 원)
    if "만원" in text:
        value = value * 10000  # 원 -> 만원

    return pd.Series([round(value, 1), unit])


# 근무지역 분리, "경기" 삽입
def split_region(region_text):
    # None 또는 NaN 처리
    if pd.isna(region_text) or str(region_text).strip().lower() == "none":
        # region1~region5 모두 None으로 반환
        return pd.Series([None]*5, index=[f"REGION{i+1}" for i in range(5)])

    # 쉼표 기준 분리 -> 공백 제거
    regions = [r.strip() for r in str(region_text).split(',') if r.strip()]

    processed = []
    for r in regions:
        if r.startswith(("전국", "서울", "인천", "경기", "강원", "충북", "충남", "대전", "세종"
                         , "경북", "경남", "대구", "부산", "울산", "전북", "전남", "광주광", "제주")) or r==None:
            processed.append(r)
        else:
            processed.append(f"경기 {r}")

    # 최대 5개까지 맞추기 (부족하면 None)
    while len(processed) < 5:
        processed.append(None)
    return pd.Series(processed[:5], index=[f"REGION{i+1}" for i in range(5)])



# 근무지역 분리 x, "경기" 삽입
def add_gg_region(region_text):
    # None 또는 NaN이면 그대로 반환
    if pd.isna(region_text) or str(region_text).strip().lower() == "none":
        return None

    # 쉼표 기준 분리 후 공백 제거
    regions = [r.strip() for r in str(region_text).split(',') if r.strip()]

    # 각 지역 앞에 접두어 추가
    processed = []
    for r in regions:
        if r.startswith(("전국", "서울", "인천", "경기", "강원", "충북", "충남", "대전", "세종"
                         , "경북", "경남", "대구", "부산", "울산", "전북", "전남", "광주광", "제주")) or r==None:
            processed.append(r)               # 서울, 인천 등은 그대로
        else:
            processed.append(f"경기 {r}")     # 나머지는 '경기 ' 붙이기

    # 다시 쉼표로 묶어 하나의 문자열로 반환
    return ", ".join(processed)


#  학력 none일 경우 0으로 일괄 채움
def acdmcr_nan(acdmcr_text):
    if acdmcr_text == None:
        return 0
    else: return acdmcr_text
    

# 경력구분 단순화 - 1: 무관, 2: 신입, 3: 경력, 4: 신입/경력 -> 1, 2, 4: 신입, 3: 경력
def career_NE(career_text):
    if pd.isna(career_text):
        return None

    s = str(career_text).strip()

    # 숫자토큰 모두 추출 (예: "03,04" -> ["03","04"])
    tokens = re.findall(r'\d+', s)

    # 앞의 0 제거하여 정규화 (예: "03" -> "3")
    codes = {str(int(t)) for t in tokens}

    if '3' in codes:
        return '경력'
    if {'1','2','4'} & codes:
        return '경력 무관'
    return None


# 직업코드 공란 처리
def recruit_na(recruit_text):
    if pd.isna(recruit_text):
        return '999999'
    else:
        return recruit_text


# 경력코드 4자리로 자름
def career_4(career_text):
    return career_text[:4]


# 각 유형(일급 월급 연봉)별 급여값을 월급으로 환산
def cal_wage_value_monthly(value: int, unit: str):
    if unit == "시급":
        return str(value * 209)
    elif unit == "일급":
        return str(value * 20)
    elif unit == "월급":
        return str(value)
    elif unit == "연봉":
        return str(round(value/12, 2))
    else:
        return None



# ================================================
# 전처리 진행부
# ================================================
def preprocess_jobs(raw_jobs):
    df = pd.DataFrame(raw_jobs)

    df[["SALARY_KRW", "SALARY_UNIT"]] = df["SALARY_COND"].apply(parse_salary)       # 급여조건 분리
    df["ACDMCR_nonNULL"] = df["ACDMCR_CD_NM"].apply(acdmcr_nan)                     # 학력조건 공백 -> 0(학력무관)
    df["CAREER_TYPE"] = df["CAREER_CD_NM"].apply(career_NE)                         # 경력구분 단순화 - 1: 무관, 2: 신입, 3: 경력, 4: 신입/경력 -> 1, 2, 4: 신입, 3: 경력
    df["RECRUT_FIELD_CD_NM_nonNA"] = df["RECRUT_FIELD_CD_NM"].apply(recruit_na)     # 직업코드 공란 -> 999999
    df["RECRUT_FIELD_CD_NM_4"] = df["RECRUT_FIELD_CD_NM_nonNA"].apply(career_4)     # 직업코드 4자리로 자름
    df["REGION_GG"] = df["WORK_REGION_CONT"].apply(add_gg_region)                   # 근무지역 -> 분리x, 앞에 '경기'만 삽입
    region_cols = df["WORK_REGION_CONT"].apply(split_region)                        # 근무지역 -> 분리, 앞에 '경기'만 삽입
    df = pd.concat([df, region_cols], axis=1)
    df["wage_value_monthly"]=df.apply(lambda row: cal_wage_value_monthly(row["SALARY_KRW"], row["SALARY_UNIT"]), axis=1)
    # df["upload_time"] = datetime.utcnow().isoformat()

    # 최종 칼럼 선택
    # df_filtered = df[['ENTRPRS_NM', 'PBANC_CONT', 'SALARY_KRW', 'SALARY_UNIT', 
    #                   'REGION_GG', 'REGION1', 'REGION2', 'REGION3', 'REGION4', 'REGION5', 
    #                   'CAREER_CD_NM', 'CAREER_TYPE', 'ACDMCR_nonNULL', 'RECRUT_FIELD_CD_NM', 'RECRUT_FIELD_CD_NM_nonNA', 'RECRUT_FIELD_NM']]

    df_filtered = df[['ENTRPRS_NM', 'PBANC_CONT', 'SALARY_UNIT', 'SALARY_KRW', 
                      'REGION1', 'CAREER_TYPE', 'RECRUT_FIELD_CD_NM_4', 
                      'RECRUT_FIELD_NM', 'CAREER_CD_NM', 'ACDMCR_nonNULL', 'wage_value_monthly']]

    Index_df_filtered = ['company', 'job_title', 'wage_type', 'wage_value_krw', 
                    'region', 'career', 'RCRIT_JSSFC_CMMN_CODE_SE', 
                    'JOBCODE_NM', 'CAREER_CND_CMMN_CODE_SE', 'ACDMCR_CMMN_CODE_SE', 'wage_value_monthly']


    return df_filtered, Index_df_filtered
    # return df


# ================================================
# API 호출 함수(chunk size, )
# ================================================
def fetch_jobs(size: int, pageIdx: int):
    # all_rows = []
    page_idx = pageIdx
    PAGE_SIZE = size

    params = {
        "KEY": API_KEY,
        "Type": "json",
        "pIndex": page_idx,
        "pSize": PAGE_SIZE,
    }
    
    response = requests.get(BASE_URL, params=params)
    response.encoding = 'utf-8'

    data = response.json()
    rows = data["GGJOBABARECRUSTM"][1]["row"]  # 실제 데이터 위치

    # all_rows.extend(rows)
    # print(f"{page_idx}페이지 수집 완료: {len(rows)}개 항목")


    df = pd.DataFrame(rows)
    print(f"총 수집 건수: {len(df)}")

    return df


# ================================================
# Blob 저장 - json / csv
# ================================================
def save_to_blob(df):
    # 한국 시간대로 현재 날짜와 시간 가져오기
    now_korea = datetime.now(timezone('Asia/Seoul'))

    blob_service = BlobServiceClient.from_connection_string(STORAGE_CONN_STR)
    container_client = blob_service.get_container_client("ggjob-data")
    filename = f"ggjobs_{now_korea.strftime('%Y%m%d_%H%M%S')}.json"
    # filename = f"jobs_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.json"

    json_bytes = df.to_json(orient="records", force_ascii=False).encode('utf-8')
    container_client.upload_blob(name=filename, data=io.BytesIO(json_bytes), overwrite=True)
    return filename


def save_to_blob_csv(df, df_header):
    now_korea = datetime.now(timezone('Asia/Seoul'))

    blob_service = BlobServiceClient.from_connection_string(STORAGE_CONN_STR)
    container_client = blob_service.get_container_client("ggjob-data")

    filename = f"ggjobs_{now_korea.strftime('%Y%m%d_%H%M%S')}.csv"
    blob_client = container_client.get_blob_client(filename)
    csv_bytes = df.to_csv(index=False, header=df_header, encoding="utf-8-sig").encode("utf-8-sig")
    blob_client.upload_blob(csv_bytes, overwrite=True)
    logging.info(f"Blob 업로드 완료: {filename}")

    return filename


# ================================================
# Blob을 이용해 현재 페이지 상태를 관리
# ================================================
def get_next_page_from_blob(reset: bool = False) -> int:
    """페이지 상태를 Azure Blob Storage에 저장 및 관리"""
    connection_str = os.environ["AzureWebJobsStorage"]
    container_name = "function-state"
    blob_name = "page_state.txt"

    blob_service = BlobServiceClient.from_connection_string(connection_str)
    container_client = blob_service.get_container_client(container_name)
    blob_client = container_client.get_blob_client(blob_name)

    # 컨테이너가 없으면 생성
    try:
        container_client.create_container()
    except Exception:
        pass  # 이미 존재하면 무시

    # === ✅ 재시작 시 초기화 처리 ===
    if reset:
        blob_client.upload_blob("1", overwrite=True)
        logging.info("[RESET] 함수 재시작 감지 → Blob 내 page_state.txt를 1로 초기화했습니다.")
        return 1

    # === 기존 페이지 상태 불러오기 ===
    try:
        data = blob_client.download_blob().readall().decode("utf-8").strip()
        last_page = int(data)
    except Exception:
        last_page = 1  # 처음 실행 시 1부터 시작

    # === 페이지 증가 후 저장 ===
    next_page = last_page + 1
    blob_client.upload_blob(str(next_page), overwrite=True)
    return next_page


# ================================================
# Event Hubs 전송
# ================================================
def send_to_eventhub(df, page_index: int):
    """
    매 분마다 생성된 DataFrame 전체를 CSV 문자열로 변환해
    하나의 Event로 Event Hub에 전송한다.
    """
    producer = EventHubProducerClient.from_connection_string(
        conn_str=EVENTHUB_CONN_STR,
        eventhub_name=EVENTHUB_NAME
    )

    # === 1️⃣ DataFrame → CSV 문자열 변환 ===
    csv_buffer = io.StringIO()
    df.to_csv(csv_buffer, index=False, encoding="utf-8-sig")
    csv_string = csv_buffer.getvalue()

    # === 2️⃣ CSV 본문 앞에 메타데이터 주석 추가 ===
    # header_line = f"# next_page_index: {page_index}, last_updated: {datetime.utcnow().isoformat()}\n"
    # event_body = header_line + csv_string

    # === 3️⃣ EventData 생성 ===
    event = EventData(csv_string)

    # === 4️⃣ Event Hub로 전송 ===
    with producer:
        batch = producer.create_batch()
        batch.add(event)
        producer.send_batch(batch)

    logging.info(f"✅ EventHub 전송 완료 | 페이지 {page_index} | {len(df)}건 | {len(csv_string)} bytes")


# ================================================
# HTTP Trigger (main)
# ================================================
# "0 0 * * * *" → 매시간 정각(분, 초, 일, 월, 요일 단위)마다 파일 업로드
# 매 30분마다라면 "0 */30 * * * *"
@app.schedule(schedule="0 */1 * * * *", 
              arg_name="mytimer", 
              run_on_startup=False, 
              use_monitor=True)
def trig_connect_ggjobs(mytimer: func.TimerRequest):
    try:
        # ✅ 함수 처음 시작(run_on_startup 실행 시) → reset=True로 초기화
        # 이후 매 분 주기 실행에서는 reset=False로 동작
        reset_flag = getattr(trig_connect_ggjobs, "_initialized", False) is False
        trig_connect_ggjobs._initialized = True

        page = get_next_page_from_blob(reset=reset_flag)
        logging.info(f"API 호출 중... (페이지 {page})")

        # API 요청
        raw_jobs = fetch_jobs(100, page)
        logging.info(f"총 {len(raw_jobs)}개 데이터 수집 (페이지 {page})")

        # 데이터 전처리
        logging.info("데이터 전처리 중...")
        df, header = preprocess_jobs(raw_jobs)

        # Blob 저장
        logging.info("Blob 저장 중...")
        filename = save_to_blob_csv(df, header)

        # # Event Hubs 전송
        # logging.info("Event Hub 전송 중...")
        # send_to_eventhub(df, page)

        logging.info(f"성공적으로 {len(df)}건 처리 완료 | Blob 파일: {filename}")

    except Exception as e:
        logging.exception("에러 발생")



# ================================================
# Blob Trigger (CSV → EventHub로 그대로 전송)
# ================================================
@app.blob_trigger(arg_name="myblob",
                  path="ggjob-data/{name}",
                  connection="AzureWebJobsStorage")
def blob_to_asa(myblob: func.InputStream):
    from azure.eventhub import EventHubProducerClient, EventData

    logging.info(f"Blob Trigger 실행됨: {myblob.name} ({myblob.length} bytes)")

    # 🔥 JSON 등 CSV가 아니면 무시!
    if not myblob.name.lower().endswith(".csv"):
        logging.info(f"⚠️ CSV 파일이 아니라 무시합니다: {myblob.name}")
        return

    try:
        blob_bytes = myblob.read()
        blob_str = blob_bytes.decode('utf-8-sig')  # BOM 제거

        logging.info("CSV 원본 읽기 완료")

        producer = EventHubProducerClient.from_connection_string(
            conn_str=os.getenv("EVENTHUB_CONN_STR"),
            eventhub_name=os.getenv("EVENTHUB_NAME")
        )

        with producer:
            batch = producer.create_batch()
            batch.add(EventData(blob_str))
            producer.send_batch(batch)

        logging.info(f"CSV 파일 {myblob.name} EventHub로 전송 완료")

    except Exception as e:
        logging.exception(f"Blob 처리 중 오류 발생: {e}")



# ==========================
# Blob Trigger
# ==========================
# @app.blob_trigger(arg_name="myblob",
#                   path="ggjob-data/{name}",
#                   connection="AzureWebJobsStorage")
# def blob_to_asa(myblob: func.InputStream):
#     import json
#     from azure.eventhub import EventHubProducerClient, EventData

#     logging.info(f"Blob Trigger 실행됨: {myblob.name} ({myblob.length} bytes)")

#     try:
#         # 1️⃣ Blob 데이터 읽기
#         blob_data = myblob.read().decode('utf-8-sig')
#         logging.info("Blob 데이터 읽기 완료")

#         # 2️⃣ JSON 파싱 (필요시 전처리)
#         # records = json.loads(blob_data)
#         records = pd.read_csv(io.StringIO(blob_data))

#         # 3️⃣ Event Hubs로 전송 → Stream Analytics가 수신하도록
#         producer = EventHubProducerClient.from_connection_string(
#             conn_str=os.getenv("EVENTHUB_CONN_STR"),
#             eventhub_name=os.getenv("EVENTHUB_NAME")
#         )

#         with producer:
#             batch = producer.create_batch()
#             for record in records:
#                 # 각 행을 하나의 EventData로 전송
#                 batch.add(EventData(json.dumps(record, ensure_ascii=False)))
#             producer.send_batch(batch)

#         logging.info(f"Blob {myblob.name} 처리 완료, {len(records)}건 전송")

#     except Exception as e:
#         logging.exception(f"Blob 처리 중 오류 발생: {e}")