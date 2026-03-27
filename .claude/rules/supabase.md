---
description: insung_blog Supabase 규칙 — DDL 금지, RLS, 마이그레이션
globs: "**/*.{py,sql}"
---

# Supabase 규칙

## DDL 금지
- Claude에서 직접 DDL(CREATE TABLE, ALTER TABLE, DROP) 실행 금지
- 스키마 변경이 필요하면 마이그레이션 SQL 파일만 생성
- 파일 위치: `supabase/migrations/`

## RLS 정책
- 테이블 생성 시 RLS 활성화 필수
- `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
- RLS 정책 없이 데이터 접근 금지

## 쿼리
- `supabase.from_().select()` 사용 (ORM 스타일)
- raw SQL 사용 시 파라미터 바인딩 필수
- f-string으로 쿼리 조합 금지
