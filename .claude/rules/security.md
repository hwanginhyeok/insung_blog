---
description: insung_blog 보안 규칙 — Playwright, 쿠키, API 인가
globs: "**/*.py"
---

# 보안 규칙

## Playwright
- `page.evaluate(f"...")` 금지 — f-string으로 JS 코드 조합하면 인젝션 위험
- `page.evaluate()` 사용 시 파라미터는 반드시 두 번째 인자로 전달
- 예: `page.evaluate("(arg) => ...", arg)` ✅, `page.evaluate(f"... {arg} ...")` ❌

## 쿠키/세션
- 쿠키 값을 로그에 출력 금지
- 세션 토큰을 변수에 하드코딩 금지
- httpOnly, secure 플래그 필수

## API 인가
- 모든 API 엔드포인트에 인증 미들웨어 확인
- 공개 엔드포인트는 명시적으로 표기
- Supabase RLS 정책 우회 금지
