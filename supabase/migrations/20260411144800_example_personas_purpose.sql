-- Migration: example_personas_purpose
-- Created: 2026-04-11
-- Description: example_personas에 purpose 컬럼 추가 (Phase 2 백엔드 lazy loading 필터용)
--   - 기본값 'writing' (기존 84개 예시는 모두 글쓰기 카테고리 기준)
--   - 추후 댓글/답글 전용 예시 추가 시 'comment'/'reply'로 시딩
-- 플랜: docs/프로젝트/plans/persona-tier-split.md § 4.3

BEGIN;

ALTER TABLE example_personas
    ADD COLUMN IF NOT EXISTS purpose TEXT NOT NULL DEFAULT 'writing'
        CHECK (purpose IN ('writing', 'comment', 'reply'));

CREATE INDEX IF NOT EXISTS idx_example_personas_purpose
    ON example_personas (purpose, category);

COMMENT ON COLUMN example_personas.purpose IS '예시 페르소나 용도: writing(기본)/comment/reply. lazy loading 필터링용';

COMMIT;
