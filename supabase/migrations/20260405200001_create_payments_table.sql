-- 결제 이력 테이블
-- 포트원 웹훅에서 결제 완료 시 기록

CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    portone_payment_id TEXT NOT NULL UNIQUE,  -- 웹훅 멱등성 보장
    amount INTEGER NOT NULL,                  -- 원 단위
    tier TEXT NOT NULL CHECK (tier IN ('basic', 'pro')),
    status TEXT NOT NULL CHECK (status IN ('paid', 'failed', 'cancelled', 'refunded')),
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- 사용자 본인 결제만 조회 가능
CREATE POLICY "사용자 본인 결제만 조회" ON payments
    FOR SELECT USING (auth.uid() = user_id);

CREATE INDEX idx_payments_user ON payments(user_id, created_at DESC);
