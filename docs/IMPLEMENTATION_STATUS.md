# 구현 현황 — 인성이프로젝트

> 최종 업데이트: 2026-03-04
> 
> 각 Phase별 구현 완료도 및 현재 상태 정리

---

## 📊 전체 진행 요약

| Phase | 주요 기능 | 상태 | 완료율 |
|-------|----------|------|--------|
| Phase 1 | 댓글 봇 (수집/작성/DB) | ✅ **완료** | 100% |
| Phase 2 | 게시물 발행 시스템 | ⚠️ **부분 완료** | 70% |
| Phase 3 | n8n + Telegram 연동 | 🚧 **진행 중** | 80% |
| Phase 4 | 피드백 루프 | ✅ **완료** | 100% |

---

## Phase 1: 댓글 봇 — ✅ 완료

### 핵심 기능

| 기능 | 구현 상태 | 파일 | 비고 |
|------|----------|------|------|
| 네이버 로그인 (쿠키 복원) | ✅ | `src/auth/naver_login.py` | 세션 유지, 자동 갱신 |
| 댓글 작성자 수집 | ✅ | `src/collectors/comment_collector.py` | 관리자 페이지 + 폭포수 폭백 |
| 타겟 게시물 수집 | ✅ | `src/collectors/post_collector.py` | 신형/구형 UI 모두 지원 |
| AI 댓글 생성 | ✅ | `src/commenter/ai_comment.py` | Haiku + phrases 폭백 |
| 댓글 작성 (iframe) | ✅ | `src/commenter/comment_writer.py` | mainFrame 직접 처리 |
| 실행 조율 | ✅ | `src/orchestrator.py` | 전체 흐름 관리 |
| 스케줄링 | ✅ | `main.py` | 매일 20:30 실행 |

### AI 댓글 개선사항 (2026-03-04)

| 개선 항목 | 상태 | 설명 |
|----------|------|------|
| 안전한 공감형 프롬프트 | ✅ | 애매한 구체적 정보(메뉴/가격) 언급 금지 |
| 중복 방지 | ✅ | 최근 30일 이력 기반 70% 유사도 체크, 3회 재생성 |
| 재방문 방지 | ✅ | `blogger_visit_log` 활용, 내일 새 대상자만 |
| 오류 응답 필터링 | ✅ | "죄송", "로드되지 않" 등 AI 실패 메시지 필터 |

### 데이터베이스 테이블

```sql
-- 댓글 이력 (중복 방지)
comment_history (post_url UNIQUE)

-- 일별 방문 기록 (재방문 방지)
blogger_visit_log (blogger_id, visit_date)

-- 실행 통계
run_log (visit_count, comment_count, error_count)
```

---

## Phase 2: 게시물 발행 — ⚠️ 부분 완료

### 핵심 기능

| 기능 | 구현 상태 | 파일 | 비고 |
|------|----------|------|------|
| AI 콘텐츠 생성 | ✅ | `src/ai/content_generator.py` | Vision + 카테고리 감지 + PRODUCTION_SPEC |
| 텔레그램 메모 파싱 | ✅ | `src/ai/memo_parser.py` | 구조화된 메모 입력 지원 |
| 스마트에디터 발행 | ⚠️ | `src/publisher/blog_publisher.py` | **셀렉터 업데이트 필요** |
| 카테고리 자동 선택 | ✅ | `src/ai/content_generator.py` | 4개 카테고리 지원 |
| 사진 마커 시스템 | ✅ | `src/utils/photo_marker.py` | `[PHOTO_N]` 파싱/렌더링 |
| 스타일 가이드 | ✅ | `skills/styles/*.md` | 카테고리별 AI 스타일 |

### ⚠️ 알려진 이슈

| 이슈 | 상태 | 영향 | 해결 계획 |
|------|------|------|----------|
| 스마트에디터 셀렉터 변경 | 🔴 **차단** | 발행 불가 | `scripts/validate_selectors.py`로 분석 완료, 셀렉터 전면 수정 필요 |
| HTML 프리뷰 매칭 | 🟡 개선 중 | UI 미흡 | 네이버 동일화 필요 |

### 셀렉터 검증 결과

```
검증일: 2026-03-04
결과: 0/13 성공 (100% 실패)
원인: 네이버 스마트에디터 UI 전면 변경
조치: `scripts/validate_selectors.py` 참조, 신규 셀렉터 수집 필요
```

---

## Phase 3: n8n + Telegram — 🚧 진행 중

### 핵심 기능

| 기능 | 구현 상태 | 파일 | 비고 |
|------|----------|------|------|
| FastAPI 웹훅 서버 | ✅ | `api_server.py` | 6개 엔드포인트 + Bearer 인증 |
| n8n 워크플로 | ✅ | `n8n/workflows/*.json` | blog_post_flow + comment_bot_flow |
| 텔레그램 봇 기본 | ✅ | `telegram_bot.py` | 사진 수신 → AI 초안 → 응답 |
| **댓글 승인 워크플로** | 🚧 | `telegram_bot_simple.py` | **개발 중** - `/pending` 명령어 |
| 시간대 설정 | ✅ | `src/utils/time_guard.py` | 평일 20-24시, 주말 13-18시 |
| 설정 명령어 | ✅ | `/settings`, `/set_mode`, `/set_weekday`, `/set_weekend` |

### 댓글 승인 워크플로 (신규)

```
[수집] → [AI 댓글 생성] → [DB pending] → [텔레그램 /pending] → [승인/거부] → [실행 큐] → [일괄 실행] → [결과 통보]
```

| 명령어 | 기능 | 상태 |
|--------|------|------|
| `/pending` | 대기 중인 댓글 목록 표시 | ✅ |
| `✅ 승인` | 댓글을 실행 큐에 추가 | ✅ |
| `❌ 거부` | 댓글 거부 (DB 상태 변경) | ✅ |
| `/execute` | 승인된 댓글 일괄 실행 | 🚧 개발 중 |

### 데이터베이스 테이블 (신규)

```sql
-- 시스템 설정
settings (key, value)
  - approval_mode: manual/auto
  - weekday_start_hour: 20
  - weekday_end_hour: 24
  - weekend_start_hour: 13
  - weekend_end_hour: 18

-- 승인 대기 댓글
pending_comments (
  id, post_url, post_title, 
  generated_comment, status (pending/posted/rejected),
  created_at, processed_at
)

-- 재시도 큐
retry_queue (
  id, post_url, retry_count, 
  next_retry_at, error_message
)
```

---

## Phase 4: 피드백 루프 — ✅ 완료

| 기능 | 구현 상태 | 파일 | 비고 |
|------|----------|------|------|
| 피드백 기록 | ✅ | `src/ai/skill_manager.py` | `/feedback` 엔드포인트 |
| 스타일 자동 갱신 | ✅ | `skill_manager.py` | 5건 누적 시 AI 패턴 분석 |
| API 엔드포인트 | ✅ | `api_server.py` | POST `/feedback` |

---

## 🎯 현재 집중 영역

### P0 (즉시 처리 필요)

| 작업 | 설명 | 담당 파일 |
|------|------|----------|
| 셀렉터 업데이트 | 네이버 UI 변경 대응 | `src/publisher/blog_publisher.py` |
| 승인 워크플로 완성 | `/execute` 명령어 + 일괄 실행 | `telegram_bot_simple.py` |
| orchestrator 연동 | 수동 승인 모드 통합 | `src/orchestrator.py` |

### P1 (다음 단계)

| 작업 | 설명 | 담당 파일 |
|------|------|----------|
| 재시도 큐 처리 | 다음날 우선 실행 | `src/orchestrator.py` |
| 캡차 알림 | 텔레그램 캡차 알림 | `telegram_bot.py` |
| 실행 리포트 | 결과 통계 및 모드 전환 제안 | `telegram_bot.py` |

---

## 📁 주요 파일 목록

### 진입점

| 파일 | 역할 | 상태 |
|------|------|------|
| `main.py` | 댓글 봇 스케줄러 | ✅ |
| `publisher_main.py` | 게시물 발행 CLI | ⚠️ (셀렉터 이슈) |
| `api_server.py` | FastAPI 서버 | ✅ |
| `telegram_bot.py` | 텔레그램 봇 (사진→AI) | ✅ |
| `telegram_bot_simple.py` | 텔레그램 봇 (승인 워크플로) | 🚧 |

### 설정 및 문서

| 파일 | 역할 |
|------|------|
| `skills/PRODUCTION_SPEC.md` | AI 블로그 제작 스펙 |
| `skills/INPUT_GUIDE.md` | 텔레그램 입력 가이드 |
| `scripts/validate_selectors.py` | 셀렉터 검증 도구 |

---

## 💰 비용 정보

| 항목 | 비용 | 비고 |
|------|------|------|
| AI 댓글 (Haiku) | ~$0.00018/건 | 월 50개 기준 ~$0.11 |
| AI 블로그 초안 (Sonnet) | ~$0.01-0.03/건 | Vision + 텍스트 생성 |

---

## 📝 최근 변경 이력

| 날짜 | 변경 내용 | 관련 파일 |
|------|----------|----------|
| 2026-03-04 | 텔레그램 승인 워크플로 추가 | `telegram_bot_simple.py` |
| 2026-03-04 | pending_comments 테이블 추가 | `src/storage/database.py` |
| 2026-03-04 | AI 댓글 안전 필터 강화 | `src/commenter/ai_comment.py` |
| 2026-03-04 | 주말 시간대 확장 (13-18시) | `src/utils/time_guard.py` |
| 2026-03-03 | 사진 마커 시스템 구현 | `src/utils/photo_marker.py` |
| 2026-03-03 | 셀렉터 검증 도구 작성 | `scripts/validate_selectors.py` |
