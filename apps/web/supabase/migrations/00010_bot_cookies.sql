-- Migration: 00010_bot_cookies
-- Created: 2026-03-08
-- Description: 네이버 세션 쿠키 업로드 테이블
-- 사유: ID/PW 대신 쿠키 기반 로그인 — 웹에서 업로드, 봇이 읽어 사용.
--       쿠키는 세션 기반(만료됨)이므로 자격증명보다 안전.

CREATE TABLE IF NOT EXISTS public.bot_cookies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  cookie_data JSONB NOT NULL,
  uploaded_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE public.bot_cookies ENABLE ROW LEVEL SECURITY;

-- 사용자는 자기 쿠키만 조회/수정 가능
CREATE POLICY "cookies_select_own" ON public.bot_cookies
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "cookies_insert_own" ON public.bot_cookies
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "cookies_update_own" ON public.bot_cookies
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "cookies_delete_own" ON public.bot_cookies
  FOR DELETE USING (auth.uid() = user_id);
