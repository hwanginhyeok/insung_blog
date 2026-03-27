---
description: insung_blog 테스트 규칙 — 구문 검증, E2E 브라우저 요구사항
globs: "**/*.py"
---

# 테스트 규칙

## 구문 검증
- Python 파일 수정 시 `py_compile`로 구문 검증 필수 (PostToolUse hook에서 자동 실행)
- import 에러는 구문 검증으로 잡히지 않으므로 `python3 -c "import 모듈명"` 추가 확인

## E2E 테스트
- Playwright 테스트는 브라우저 필요 — headless 모드 사용
- 브라우저 미설치 시: `.venv/bin/python -m playwright install chromium`
- E2E 테스트 파일에 브라우저 필요 여부 주석 표기

## 테스트 실행
- `source .venv/bin/activate && pytest -v --tb=short`
- API 테스트는 서버 실행 상태 확인 후 실행
