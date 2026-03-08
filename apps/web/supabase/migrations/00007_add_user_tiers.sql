-- Migration: 00007_add_user_tiers
-- Created: 2026-03-07
-- Description: 사용자 구독 티어 + 월간 사용량 추적 컬럼 추가
--
-- 티어별 월간 AI 생성 한도:
--   free  (무료)   → 10회/월
--   basic (베이직) → 50회/월
--   pro   (프로)   → 200회/월

-- 구독 티어
ALTER TABLE users
  ADD COLUMN tier TEXT DEFAULT 'free' CHECK (tier IN ('free', 'basic', 'pro'));

-- 월간 AI 생성 사용량
ALTER TABLE users
  ADD COLUMN monthly_gen_count INTEGER DEFAULT 0;

-- 카운트 기준 월 (YYYY-MM). 현재 월과 다르면 카운트 자동 리셋.
ALTER TABLE users
  ADD COLUMN gen_count_reset_month TEXT;

-- 인덱스
CREATE INDEX idx_users_tier ON users(tier);

-- 주석
COMMENT ON COLUMN users.tier IS '구독 티어: free(10회/월), basic(50회/월), pro(200회/월)';
COMMENT ON COLUMN users.monthly_gen_count IS '현재 월 AI 생성 횟수';
COMMENT ON COLUMN users.gen_count_reset_month IS '카운트 기준 월 (YYYY-MM)';
