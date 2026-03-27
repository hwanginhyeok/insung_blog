-- 00024: 유저별 일일 댓글봇 한도 추가
-- 무료 런칭 Freemium Gate: 유저별 일일 봇 실행 횟수 제한

-- bot_settings에 일일 한도 컬럼 추가
ALTER TABLE bot_settings
  ADD COLUMN IF NOT EXISTS daily_comment_limit INTEGER DEFAULT 30,
  ADD COLUMN IF NOT EXISTS daily_comment_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS comment_count_reset_date TEXT;

-- 피드백 테이블 (인앱 AI 글쓰기 피드백 수집)
CREATE TABLE IF NOT EXISTS writing_feedback (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  generation_id UUID REFERENCES generation_queue(id) ON DELETE SET NULL,
  would_use_again BOOLEAN NOT NULL,
  feedback_text TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE writing_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "유저 본인 피드백만 조회" ON writing_feedback
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "유저 본인 피드백만 등록" ON writing_feedback
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 온보딩 완료 여부 (users 테이블에 추가)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false;

-- 일일 봇 한도 체크 + 증분 RPC (atomic)
CREATE OR REPLACE FUNCTION check_daily_bot_limit(p_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_limit INTEGER;
  v_count INTEGER;
  v_reset_date TEXT;
  v_today TEXT;
  v_allowed BOOLEAN;
BEGIN
  v_today := to_char(now() AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD');

  -- 행 잠금으로 동시 실행 방지
  SELECT daily_comment_limit, daily_comment_count, comment_count_reset_date
  INTO v_limit, v_count, v_reset_date
  FROM bot_settings
  WHERE user_id = p_user_id
  FOR UPDATE;

  -- 설정이 없으면 기본값
  IF NOT FOUND THEN
    RETURN json_build_object(
      'allowed', true,
      'used', 0,
      'limit', 30,
      'remaining', 30
    );
  END IF;

  -- 날짜가 바뀌면 카운트 리셋
  IF v_reset_date IS NULL OR v_reset_date <> v_today THEN
    v_count := 0;
    UPDATE bot_settings
    SET daily_comment_count = 0,
        comment_count_reset_date = v_today
    WHERE user_id = p_user_id;
  END IF;

  v_allowed := v_count < v_limit;

  -- 허용되면 카운트 증분
  IF v_allowed THEN
    UPDATE bot_settings
    SET daily_comment_count = v_count + 1
    WHERE user_id = p_user_id;
  END IF;

  RETURN json_build_object(
    'allowed', v_allowed,
    'used', CASE WHEN v_allowed THEN v_count + 1 ELSE v_count END,
    'limit', v_limit,
    'remaining', CASE WHEN v_allowed THEN v_limit - v_count - 1 ELSE 0 END
  );
END;
$$;
