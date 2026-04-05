-- 결제 구독 필드 추가
-- 포트원 V2 + 카카오페이 정기결제 연동

ALTER TABLE users ADD COLUMN subscription_status TEXT DEFAULT 'none'
    CHECK (subscription_status IN ('none', 'active', 'past_due', 'cancelled'));

ALTER TABLE users ADD COLUMN portone_billing_key TEXT;
ALTER TABLE users ADD COLUMN portone_schedule_id TEXT;
ALTER TABLE users ADD COLUMN subscription_started_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN subscription_ends_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN next_payment_at TIMESTAMPTZ;

-- 만료 구독 조회용 부분 인덱스 (Vercel Cron에서 사용)
CREATE INDEX idx_users_subscription_expiry
    ON users(subscription_ends_at)
    WHERE subscription_status = 'cancelled' AND subscription_ends_at IS NOT NULL;
