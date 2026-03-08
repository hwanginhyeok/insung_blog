-- 원자적 사용량 체크 + 증분 함수
-- 레이스 컨디션 방지: FOR UPDATE 행 잠금으로 동시 요청 시 직렬 실행
--
-- 반환값 (jsonb):
--   allowed: boolean, tier: string, used: int, limit: int, remaining: int
--
-- 사용: supabase.rpc('reserve_generation', { p_user_id: userId })

CREATE OR REPLACE FUNCTION reserve_generation(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tier text;
  v_count int;
  v_limit int;
  v_month text;
  v_current_month text;
BEGIN
  v_current_month := to_char(now(), 'YYYY-MM');

  -- 행 잠금 (동시 요청 직렬화)
  SELECT tier, monthly_gen_count, gen_count_reset_month
  INTO v_tier, v_count, v_month
  FROM users WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'allowed', false, 'tier', 'free',
      'used', 0, 'limit', 0, 'remaining', 0
    );
  END IF;

  v_tier := COALESCE(v_tier, 'free');
  v_limit := CASE v_tier
    WHEN 'pro' THEN 200
    WHEN 'basic' THEN 50
    ELSE 10
  END;

  -- 월 전환 시 카운트 리셋
  IF v_month IS DISTINCT FROM v_current_month THEN
    v_count := 0;
  END IF;

  -- 한도 초과 체크
  IF v_count >= v_limit THEN
    RETURN jsonb_build_object(
      'allowed', false, 'tier', v_tier,
      'used', v_count, 'limit', v_limit, 'remaining', 0
    );
  END IF;

  -- 원자적 증분
  UPDATE users SET
    monthly_gen_count = v_count + 1,
    gen_count_reset_month = v_current_month
  WHERE id = p_user_id;

  RETURN jsonb_build_object(
    'allowed', true, 'tier', v_tier,
    'used', v_count + 1, 'limit', v_limit,
    'remaining', v_limit - v_count - 1
  );
END;
$$;

-- rollback 함수: AI 호출 실패 시 카운트 원복
CREATE OR REPLACE FUNCTION rollback_generation(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE users SET
    monthly_gen_count = GREATEST(0, COALESCE(monthly_gen_count, 0) - 1)
  WHERE id = p_user_id;
END;
$$;
