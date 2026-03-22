# SCALABILITY 브리핑

## 요약
현재 아키텍처의 확장성을 분석하고, 유저 10/50/100명 시나리오별 병목을 식별한 리포트 작성.

## 변경 파일
- `docs/프로젝트/reports/scalability_report.md` — **신규** 확장성 점검 리포트

## 기술 결정
- 코드 분석 기반 정적 분석 (실행 테스트 없음)
- 5개 영역 분석: command_worker, SQLite, Playwright, Supabase, 전체 아키텍처

## 테스트 결과
- N/A (문서 작업)

## 남은 작업 / 주의사항
- 실제 부하 테스트 필요 (향후)
- PostgreSQL 전환 검토 시점: 유저 10명 초과 시
