# 구현 현황 — 인성이프로젝트

> 최종 업데이트: 2026-03-09
>
> 로컬 봇(Phase 1~4) + 웹 플랫폼(W1~W6 + P3) 구현 현황

---

## 📊 전체 진행 요약

### 로컬 봇 (Python + Playwright)

| Phase | 주요 기능 | 상태 | 완료율 |
|-------|----------|------|--------|
| Phase 1 | 댓글 봇 (수집/작성/DB) | ✅ **완료** | 100% |
| Phase 2 | 게시물 발행 시스템 | ⚠️ **부분 완료** | 70% |
| Phase 3 | n8n + Telegram 연동 | 🚧 **진행 중** | 80% |
| Phase 4 | 피드백 루프 | ✅ **완료** | 100% |

### 웹 플랫폼 (Next.js 14 + Supabase + Vercel)

| Week | 주요 기능 | 상태 | 완료율 |
|------|----------|------|--------|
| W1 | 인프라 세팅 (Supabase, Storage, 레이아웃) | ✅ **완료** | 100% |
| W2 | 인증 + 대시보드 (Auth, RLS, 내 글 목록) | ✅ **완료** | 100% |
| W3 | AI 글쓰기 (사진 업로드 → Vision → 초안 → 저장) | ✅ **완료** | 100% |
| W4 | 마무리 + 보안 (재생성, 코드리뷰 7건, 3티어 사용량 제한) | ✅ **완료** | 100% |
| W5 | 페르소나 학습 (크롤링 → AI 2-pass 분석 → HTML 렌더러 → 피드백 루프) | ✅ **완료** | 100% |
| W6 | 댓글 봇 웹 통합 (Supabase 제어 평면, 텔레그램+웹 이중 제어) | ✅ **완료** | 100% |
| P3 | 확장 기능 (다중 페르소나, 캘린더, 성과 분석, OAuth) | ✅ **완료** | 100% |

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

## 웹 플랫폼: P3 확장 기능 — ✅ 완료

> 상세 문서: `docs/프로젝트/tasks/P3-확장기능.md`

### EXT-04: 다중 페르소나

| 기능 | 구현 상태 | 파일 | 비고 |
|------|----------|------|------|
| 1:N 관계 전환 | ✅ | migration 00012 | UNIQUE 제거 + is_default |
| 페르소나 목록 UI | ✅ | `persona/page.tsx` | 그리드 카드 + 추가 폼 |
| 페르소나 상세 UI | ✅ | `persona/[id]/page.tsx` | 7카테고리 아코디언 |
| 글쓰기 시 선택 | ✅ | `write/page.tsx` | 드롭다운 선택기 |
| 기본 페르소나 지정 | ✅ | `api/persona/default` | admin 클라이언트 |

### EXT-02: 콘텐츠 캘린더

| 기능 | 구현 상태 | 파일 | 비고 |
|------|----------|------|------|
| 캘린더 테이블 | ✅ | migration 00013 | RLS 4개 정책 |
| CRUD API | ✅ | `api/calendar/route.ts` | GET/POST/PATCH/DELETE |
| 월별 그리드 UI | ✅ | `calendar/page.tsx` | 순수 React (라이브러리 없음) |
| 글쓰기 연동 | ✅ | `write/page.tsx` | `?calendar_id=` 파라미터 |

### EXT-03: 성과 분석

| 기능 | 구현 상태 | 파일 | 비고 |
|------|----------|------|------|
| 분석 테이블 + 뷰 | ✅ | migration 00014 | DISTINCT ON 최신 스냅샷 뷰 |
| 크롤링 모듈 | ✅ | `lib/crawl/naver-blog.ts` | `extractPostMetrics()` |
| 통계 API | ✅ | `api/analytics/route.ts` | 스냅샷 + 타임라인 + 요약 |
| 대시보드 UI | ✅ | `analytics/page.tsx` | recharts 차트 + 카드 |

### EXT-05: OAuth 소셜 로그인

| 기능 | 구현 상태 | 파일 | 비고 |
|------|----------|------|------|
| 카카오 OAuth | ✅ | `api/auth/kakao/` | login + callback |
| 네이버 OAuth | ✅ | `api/auth/naver/` | login + callback |
| 계정 연결 | ✅ | callback routes | 동일 이메일 자동 merge |
| 로그인 버튼 | ✅ | `login/page.tsx` | 카카오 노랑 + 네이버 초록 |

---

## 🎯 현재 집중 영역

### 웹 플랫폼 — 다음 단계

| 우선순위 | 작업 | 설명 |
|----------|------|------|
| P1 | Vercel 프로덕션 배포 | 환경변수 + 도메인 설정 |
| P1 | 모바일 반응형 | write 페이지 핵심 (블로거 대다수 모바일) |
| P1 | 신규 가입자 온보딩 | 가입→블로그URL→크롤링→첫 글 플로우 |
| P2 | 랜딩 페이지 | 서비스 소개 + 사용 예시 |

### 로컬 봇 — 잔여

| 작업 | 설명 | 담당 파일 |
|------|------|----------|
| 셀렉터 업데이트 | 네이버 UI 변경 대응 (보류) | `blog_publisher.py` |

---

## 💰 비용 정보

| 항목 | 비용 | 비고 |
|------|------|------|
| AI 댓글 (Haiku) | ~$0.00018/건 | 월 50개 기준 ~$0.11 |
| AI 블로그 초안 (Haiku) | ~$0.003-0.01/건 | 웹 플랫폼 기준 |
| AI 페르소나 분석 (Sonnet) | ~$0.05/회 | 1회성 (크롤링 시) |
| Supabase | 무료 | Free tier 범위 내 |
| Vercel | 무료 | Hobby plan |

---

## 📝 최근 변경 이력

| 날짜 | 변경 내용 | 관련 파일 |
|------|----------|----------|
| 2026-03-09 | P3 확장 기능 4건 전체 완료 | 마이그레이션 00012~00015 + 신규 라우트/페이지 |
| 2026-03-08 | 보안 개선 3건 (쿠키 업로드, 배치 댓글, credentials 삭제) | migration 00009, 00010 |
| 2026-03-08 | UX 개선 5건 (이탈 경고, 글 불러오기, 이미지 압축 등) | write/page.tsx, image-compress.ts |
| 2026-03-08 | 관리자 페이지 (사용자 목록, 티어/상태 변경) | admin/page.tsx, api/admin |
| 2026-03-08 | 댓글 봇 웹 통합 (W6 완료) | bot/page.tsx, api/bot/* |
| 2026-03-07 | 페르소나 학습 파이프라인 (W5 완료) | persona/*, api/persona/*, lib/ai/* |
| 2026-03-06 | 웹 플랫폼 W1~W4 일괄 완료 | apps/web/ 전체 |
| 2026-03-04 | 텔레그램 승인 워크플로 추가 | `telegram_bot_simple.py` |
| 2026-03-04 | AI 댓글 안전 필터 강화 | `src/commenter/ai_comment.py` |
