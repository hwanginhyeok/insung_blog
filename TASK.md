# 인성이블로그 태스크

> Current: [CURRENT_TASK.md](CURRENT_TASK.md) | Prepared: [PREPARED_TASK.md](PREPARED_TASK.md) | Finished: [FINISHED_TASK.md](FINISHED_TASK.md)

## 요약

- Current: 2개
- Prepared: 12개 (P1: 6, P2: 6)
- Finished: 18개

---

## 프로젝트 방향 전환 (2026-03-06)

**기존**: 로컬 Python 스크립트 + 텔레그램 봇 (개인 도구)
**새 방향**: **웹 플랫폼(홈페이지)** — AI 블로그 글쓰기 파트너

- 인성이 전용 MVP → 사용자 확장
- 자동 발행 → AI와 함께 글쓰기 (사용자가 직접 게시)
- 댓글 봇은 별도 로컬 운영 유지

### 아키텍처

```
웹 플랫폼 (Next.js 14 + Vercel)
├── 프론트: 로그인, 대시보드, AI 글쓰기 에디터, 댓글 봇 관리(/bot)
├── 백엔드: Next.js API Routes (Claude API + Bot 제어)
├── DB/Auth/Storage: Supabase
└── AI: Anthropic TS SDK (Vision + Sonnet + Haiku)

Supabase (공유 제어 평면)
├── pending_comments  ← 웹·텔레그램 양쪽에서 승인/거부
├── bot_settings      ← 봇 설정 (시간대, 한도, 모드)
└── bot_run_log       ← 실행 이력 (상태 대시보드)

로컬 (봇 운영)
├── 댓글 봇 (Python + Cron) → Supabase 제어 평면 읽기/쓰기
├── SQLite (운영 데이터: comment_history, visit_log, behavior)
└── 텔레그램 봇 → Supabase 제어 평면 읽기/쓰기
```
