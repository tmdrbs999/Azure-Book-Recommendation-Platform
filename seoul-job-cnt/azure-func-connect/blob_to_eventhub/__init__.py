import logging
import azure.functions as func
# BlobClient와 os, json은 더 이상 속성 조회에 필요하지 않으므로 주석 처리하거나 제거 가능하지만,
# 여기서는 Event Hub 관련 모듈만 남기고 정리했습니다.
from azure.eventhub import EventHubProducerClient, EventData
import os
import json # Event Hub 전송 시 JSON 직렬화에 사용될 수 있으므로 유지

# pandas 모듈이 필요하지 않은 경우 제거하면 좋습니다. (이전 질문들의 코드를 바탕으로)


def main(myblob: func.InputStream):
    """
    Blob Storage에 새 파일이 업로드되면 실행되어 
    파일의 내용을 읽어 Event Hub로 전송합니다. (메타데이터 대신 파일 내용)
    """
    logging.info(f"Blob Trigger 실행됨: {myblob.name}, Size: {myblob.length} bytes")

    # 1. Blob 파일 내용 읽기
    try:
        # func.InputStream을 사용하여 메모리에 있는 파일 내용을 바로 읽어옵니다.
        # 텍스트 파일(CSV 등)이라고 가정하고 'utf-8'로 디코딩합니다.
        # 파일이 매우 큰 경우, 이 방식은 메모리 문제를 일으킬 수 있으므로 주의해야 합니다.
        file_content = myblob.read().decode('utf-8')
        logging.info(f"✅ Blob 내용 {myblob.length} bytes 읽기 완료.")
        
    except Exception as e:
        logging.error(f"❌ Blob 내용 읽기 실패: {e}")
        # 읽기 실패 시 처리를 중단합니다.
        return


    # 2. Event Hub 전송 준비
    eventhub_conn = os.getenv("EVENTHUB_CONNECTION")
    eventhub_name = os.getenv("EVENTHUB_NAME")

    if not eventhub_conn or not eventhub_name:
        logging.error("❌ EVENTHUB_CONNECTION 또는 EVENTHUB_NAME 환경 변수가 설정되지 않았습니다.")
        return

    try:
        producer = EventHubProducerClient.from_connection_string(
            eventhub_conn,
            eventhub_name=eventhub_name
        )

        # 3. Event Hub로 파일 내용 전송
        # 파일 내용 전체를 하나의 EventData로 전송합니다.
        # 파일 내용이 Event Hub 메시지 크기 제한(약 1MB)을 넘지 않는지 확인해야 합니다.
        event_data = EventData(file_content)
        
        with producer:
            # 단일 메시지를 배치로 묶어 전송합니다.
            event_data_batch = producer.create_batch()
            event_data_batch.add(event_data)
            producer.send_batch(event_data_batch)

        logging.info(f"✅ Event Hub로 Blob 내용 ({myblob.length} bytes) 전송 완료")
        
    except Exception as e:
        # Event Hub 전송 실패 시 로그 기록
        logging.error(f"❌ Event Hub 전송 실패: {e}")
        # 파일 크기 제한 초과 오류가 자주 발생하는 경우, 파일을 레코드별로 분할하여 전송해야 합니다.