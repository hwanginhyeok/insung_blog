-- persona_feedback RLS + example 테이블 (이전 마이그레이션에서 실패한 부분)

-- persona_feedback RLS (persona_id → user_personas 간접 검증)
-- 이미 적용된 정책은 DROP 후 재생성
ALTER TABLE persona_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "persona_feedback_select" ON persona_feedback;
DROP POLICY IF EXISTS "persona_feedback_insert" ON persona_feedback;
DROP POLICY IF EXISTS "persona_feedback_update" ON persona_feedback;

CREATE POLICY "persona_feedback_select" ON persona_feedback
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM user_personas WHERE id = persona_feedback.persona_id AND user_id = auth.uid())
    );
CREATE POLICY "persona_feedback_insert" ON persona_feedback
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM user_personas WHERE id = persona_feedback.persona_id AND user_id = auth.uid())
    );
CREATE POLICY "persona_feedback_update" ON persona_feedback
    FOR UPDATE USING (
        EXISTS (SELECT 1 FROM user_personas WHERE id = persona_feedback.persona_id AND user_id = auth.uid())
    );

-- 예시 페르소나 테이블
CREATE TABLE IF NOT EXISTS example_personas (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    display_name    TEXT NOT NULL,
    category        TEXT NOT NULL,
    description     TEXT NOT NULL DEFAULT '',
    style_preview   TEXT NOT NULL DEFAULT '',
    sort_order      INT NOT NULL DEFAULT 0,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS example_persona_items (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    example_persona_id UUID NOT NULL REFERENCES example_personas(id) ON DELETE CASCADE,
    category        TEXT NOT NULL,
    key             TEXT NOT NULL,
    value           TEXT NOT NULL,
    priority        INT NOT NULL DEFAULT 5,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE example_personas ENABLE ROW LEVEL SECURITY;
ALTER TABLE example_persona_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "example_personas_select" ON example_personas;
DROP POLICY IF EXISTS "example_persona_items_select" ON example_persona_items;

CREATE POLICY "example_personas_select" ON example_personas
    FOR SELECT USING (TRUE);
CREATE POLICY "example_persona_items_select" ON example_persona_items
    FOR SELECT USING (TRUE);

CREATE INDEX IF NOT EXISTS idx_example_personas_category ON example_personas (category);
CREATE INDEX IF NOT EXISTS idx_example_persona_items_persona ON example_persona_items (example_persona_id);
