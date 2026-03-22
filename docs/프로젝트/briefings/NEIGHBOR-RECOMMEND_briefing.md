# NEIGHBOR-RECOMMEND 브리핑

## 요약
이웃 추천 시스템 확인 결과: 웹 UI(추천 탭)와 API(GET/PATCH)는 구현 완료, DB 테이블(neighbor_recommendations)도 존재. 데이터 생성 로직만 없어서 Python 추천 엔진 신규 구현.

## 변경 파일
- `src/neighbor/recommend_engine.py` — **신규** 추천 알고리즘 (교류 빈도 + 테마 매칭 기반)

## 기술 결정
- **점수 산출 방식**: 기본 1점 + 교류 횟수×2점 + 최근 7일 교류 보너스 3점 + 테마 일치 5점
- **후보 소스**: `discovered` + `one_way_follower` 타입 이웃 (아직 서로이웃이 아닌 후보)
- **중복 방지**: 이미 추천(pending/applied) 또는 이미 신청(sent/accepted)한 이웃 제외
- **대안 비교**: AI 기반 추천 vs 규칙 기반 → 외부 API 호출 금지 가드레일로 규칙 기반 채택

## 테스트 결과
- `py_compile` 구문 검증 통과
- 실행 테스트는 Supabase 연동 필요 (야간 작업에서 제외)

## 남은 작업 / 주의사항
- command_worker.py에 `generate_recommendations` 명령 핸들러 추가 (NEIGHBOR-연동 작업에서 처리)
- 주기적 실행 연동 (cron 또는 워커 스케줄)

## 핵심 코드 변경
```python
# 신규 파일: src/neighbor/recommend_engine.py
def generate_recommendations(user_id, max_recommendations=20):
    # 1. discovered/follower 후보 조회
    # 2. 이미 추천/신청한 이웃 제외
    # 3. 교류 빈도 + 테마 매칭으로 점수 산출
    # 4. 상위 N개 → neighbor_recommendations INSERT
    return { "generated": N, "skipped": M, "message": "..." }
```
