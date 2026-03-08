-- Migration: 00006_create_persona_tables
-- Created: 2026-03-07
-- Description: 페르소나 학습 파이프라인 테이블 3개 생성
--   - user_personas: 사용자별 페르소나 (1:1)
--   - persona_items: 페르소나 항목 (voice, emoji, structure, ending, forbidden, custom, formatting)
--   - persona_feedback: 피드백 이력 + AI 도출 규칙

-- ============================================================
-- 1. user_personas — 사용자별 페르소나 (1 user : 1 persona)
-- ============================================================

CREATE TABLE IF NOT EXISTS user_personas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,

    -- 페르소나 기본 정보
    display_name TEXT NOT NULL DEFAULT '',
    source_blog_url TEXT,

    -- 크롤링 상태 추적
    crawl_status TEXT DEFAULT 'none'
        CHECK (crawl_status IN ('none', 'crawling', 'analyzing', 'done', 'error')),
    crawl_post_count INT DEFAULT 0,
    crawl_error TEXT,
    crawled_at TIMESTAMPTZ,

    -- 메타데이터
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 2. persona_items — 페르소나 항목 (카테고리 7개)
-- ============================================================

CREATE TABLE IF NOT EXISTS persona_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    persona_id UUID NOT NULL REFERENCES user_personas(id) ON DELETE CASCADE,

    -- 항목 분류
    category TEXT NOT NULL
        CHECK (category IN ('voice', 'emoji', 'structure', 'ending', 'forbidden', 'custom', 'formatting')),
    key TEXT NOT NULL,
    value TEXT NOT NULL,

    -- 우선순위 (높을수록 중요 — AI 분석 시 빈도 기반)
    priority INT DEFAULT 0,

    -- 활성 여부 (사용자가 토글)
    is_active BOOLEAN DEFAULT TRUE,

    -- 출처 추적
    source TEXT NOT NULL DEFAULT 'ai'
        CHECK (source IN ('ai', 'user', 'feedback')),

    -- 메타데이터
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 3. persona_feedback — 피드백 이력 + AI 도출 규칙
-- ============================================================

CREATE TABLE IF NOT EXISTS persona_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    persona_id UUID NOT NULL REFERENCES user_personas(id) ON DELETE CASCADE,
    generation_id UUID REFERENCES generation_queue(id) ON DELETE SET NULL,

    -- 피드백 내용
    feedback_text TEXT NOT NULL,

    -- AI가 도출한 규칙 (5건마다 분석)
    derived_rule TEXT,
    rule_status TEXT DEFAULT 'pending'
        CHECK (rule_status IN ('pending', 'approved', 'rejected')),

    -- 메타데이터
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 인덱스
-- ============================================================

CREATE INDEX idx_persona_items_persona ON persona_items(persona_id);
CREATE INDEX idx_persona_items_active ON persona_items(persona_id, is_active) WHERE is_active = TRUE;
CREATE INDEX idx_persona_feedback_persona ON persona_feedback(persona_id);
CREATE INDEX idx_persona_feedback_status ON persona_feedback(persona_id, rule_status) WHERE rule_status = 'pending';

-- ============================================================
-- updated_at 자동 업데이트 트리거
-- ============================================================

CREATE TRIGGER update_user_personas_updated_at
    BEFORE UPDATE ON user_personas
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_persona_items_updated_at
    BEFORE UPDATE ON persona_items
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- RLS (Row Level Security)
-- ============================================================

ALTER TABLE user_personas ENABLE ROW LEVEL SECURITY;
ALTER TABLE persona_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE persona_feedback ENABLE ROW LEVEL SECURITY;

-- user_personas: 본인 데이터만 접근
CREATE POLICY "사용자 본인 페르소나 조회" ON user_personas
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "사용자 본인 페르소나 생성" ON user_personas
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "사용자 본인 페르소나 수정" ON user_personas
    FOR UPDATE USING (auth.uid() = user_id);

-- persona_items: 본인 페르소나의 항목만 접근
CREATE POLICY "사용자 본인 항목 조회" ON persona_items
    FOR SELECT USING (
        persona_id IN (SELECT id FROM user_personas WHERE user_id = auth.uid())
    );
CREATE POLICY "사용자 본인 항목 생성" ON persona_items
    FOR INSERT WITH CHECK (
        persona_id IN (SELECT id FROM user_personas WHERE user_id = auth.uid())
    );
CREATE POLICY "사용자 본인 항목 수정" ON persona_items
    FOR UPDATE USING (
        persona_id IN (SELECT id FROM user_personas WHERE user_id = auth.uid())
    );
CREATE POLICY "사용자 본인 항목 삭제" ON persona_items
    FOR DELETE USING (
        persona_id IN (SELECT id FROM user_personas WHERE user_id = auth.uid())
    );

-- persona_feedback: 본인 페르소나의 피드백만 접근
CREATE POLICY "사용자 본인 피드백 조회" ON persona_feedback
    FOR SELECT USING (
        persona_id IN (SELECT id FROM user_personas WHERE user_id = auth.uid())
    );
CREATE POLICY "사용자 본인 피드백 생성" ON persona_feedback
    FOR INSERT WITH CHECK (
        persona_id IN (SELECT id FROM user_personas WHERE user_id = auth.uid())
    );
CREATE POLICY "사용자 본인 피드백 수정" ON persona_feedback
    FOR UPDATE USING (
        persona_id IN (SELECT id FROM user_personas WHERE user_id = auth.uid())
    );

-- ============================================================
-- 주석
-- ============================================================

COMMENT ON TABLE user_personas IS '사용자별 페르소나 (1:1). 블로그 크롤링 상태 포함';
COMMENT ON TABLE persona_items IS '페르소나 항목. 카테고리: voice/emoji/structure/ending/forbidden/custom/formatting';
COMMENT ON TABLE persona_feedback IS '피드백 이력. 5건마다 AI 패턴 분석 → derived_rule 도출';

COMMENT ON COLUMN persona_items.category IS '항목 카테고리: voice(말투), emoji(이모지), structure(글구조), ending(마무리), forbidden(금지), custom(기타), formatting(HTML포맷)';
COMMENT ON COLUMN persona_items.source IS '항목 출처: ai(크롤링분석), user(직접추가), feedback(피드백도출)';
COMMENT ON COLUMN persona_items.priority IS '우선순위. AI 분석 시 발견 빈도 기반. 높을수록 강한 스타일 신호';
COMMENT ON COLUMN persona_feedback.rule_status IS 'AI 도출 규칙 상태: pending(대기) → approved(적용)/rejected(거절)';
