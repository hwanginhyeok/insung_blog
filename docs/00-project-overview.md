# [DEPRECATED] 프로젝트 전체 개요

> **이 문서는 더 이상 관리되지 않습니다.**
> **통합 문서**: `docs/개발/아키텍처/ARCHITECTURE.md` (v3.0)를 참조하세요.

> 최종 업데이트: 2026-03-01 (폐기: 2026-03-12)

---

## 목표

네이버 블로그 운영 3가지를 자동화:
1. **댓글 답방 봇** — 내 블로그 댓글 작성자 방문 + AI 맞춤 댓글
2. **게시물 자동 발행** — 텔레그램으로 사진+메모 → AI 초안 → 승인 → 네이버 게시
3. **AI 글쓰기 스킬 업그레이드** — 피드백 누적 → 점진적 스타일 개선

---

## 현재 코드 상태 (2026-03-01 기준)

### 완성된 것
| 모듈 | 파일 | 상태 |
|------|------|------|
| 로그인 | `src/auth/naver_login.py` | ✅ 완성 (쿠키 저장/복원) |
| 댓글 수집 | `src/collectors/comment_collector.py` | ⚠️ 관리자 URL 404 → 폴백만 동작 |
| 게시물 수집 | `src/collectors/post_collector.py` | ✅ 완성 (신형/구형 블로그 지원) |
| 댓글 작성 | `src/commenter/comment_writer.py` | ✅ 완성 (iframe 탐색, 타이핑 시뮬) |
| 댓글 문구 | `src/commenter/phrases.py` | 🔄 교체 예정 → AI 생성 방식 |
| DB 이력 | `src/storage/database.py` | ✅ 완성 (3개 테이블) |
| 딜레이 | `src/utils/delay.py` | ✅ 완성 |
| 시간 가드 | `src/utils/time_guard.py` | 🔄 시간대 변경 예정 (20~24시) |
| 오케스트레이터 | `src/orchestrator.py` | ✅ 완성 |
| 진입점 | `main.py` | ✅ 완성 |

### 없는 것 (신규 개발 필요)
- `src/commenter/ai_comment.py` — AI 댓글 생성
- `src/publisher/blog_publisher.py` — 스마트에디터 게시
- `src/publisher/image_uploader.py` — 사진 업로드
- `src/ai/content_generator.py` — AI 글 초안 생성
- `src/ai/skill_manager.py` — 피드백 → 스킬 업데이트
- `skills/writing_style.md` — 글쓰기 스타일 누적 파일
- `n8n/workflows/` — n8n 워크플로 JSON

---

## 시스템 아키텍처

```
[텔레그램]
    │
    ▼
[n8n 워크플로]
    │
    ├─ 글 작성 플로우 ──────────────────────────────────┐
    │   사진+메모 수신                                   │
    │       ↓                                           │
    │   Claude Vision (이미지 분석)                      │
    │       ↓                                           │
    │   content_generator.py (초안 + 해시태그)           │
    │       ↓                                           │
    │   텔레그램: 초안 전송 + 승인버튼                   │
    │       ↓ (승인)                                    │
    │   blog_publisher.py (스마트에디터 게시)            │
    │       ↓                                           │
    │   피드백 요청 → skill_manager.py                  │
    │                                                   │
    └─ 댓글 봇 플로우 ──────────────────────────────────┘
        스케줄: 20:00~24:00
            ↓
        comment_collector.py (내 블로그 댓글 수집)
            ↓
        post_collector.py (방문자 블로그 게시물 수집)
            ↓
        [본문 스크래핑]
            ↓
        ai_comment.py (Claude Haiku로 맞춤 댓글)
            ↓
        comment_writer.py (Playwright로 댓글 입력/제출)
```

---

## 개발 단계 (Phase)

| Phase | 내용 | 문서 | 태스크 |
|-------|------|------|--------|
| 0 | Claude API 키 발급 | — | #1 |
| 1 | 댓글 봇 AI화 + 시간대 변경 | `docs/phase1-ai-comment.md` | #2, #3, #4 |
| 2 | 게시물 자동 발행 | `docs/phase2-publisher.md` | #5, #6 |
| 3 | n8n + 텔레그램 연동 | `docs/phase3-n8n-telegram.md` | #7 |
| 4 | 피드백 루프 | `docs/phase4-feedback.md` | #8 |

---

## 환경 정보

```
OS: WSL2 Ubuntu
Python: 3.12
가상환경: .venv/
주요 라이브러리: playwright, python-dotenv, schedule
블로그 ID: letter_hih
네이버 ID: dlsgur5560
DB: data/comments.db
로그: logs/commenter.log
쿠키: cookies/naver_cookies.json
```

---

## 알려진 이슈

| 이슈 | 원인 | 해결 방법 |
|------|------|-----------|
| 관리자 댓글 URL 404 | 네이버 URL 변경 | 폴백(게시물 직접 방문)으로만 운영 |
| letter_hih 게시물 0개 | 새 블로그 | 직접 글 작성 필요 (Task #4) |
| hwag10000 댓글 불가 | 서로이웃 제한 설정 | 공개 댓글 허용 블로그로 테스트 |
