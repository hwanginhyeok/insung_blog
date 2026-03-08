-- Migration: 00001_create_users
-- Created: 2026-03-05
-- Description: 사용자 테이블 및 인증 관련 테이블 생성

-- 사용자 기본 정보 테이블
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    role TEXT DEFAULT 'user' CHECK (role IN ('admin', 'user')),
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'pending')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 사용자 네이버 인증 정보 (암호화된 형태로 저장)
CREATE TABLE IF NOT EXISTS user_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    
    -- 암호화된 네이버 계정 정보
    naver_id_encrypted TEXT,
    naver_pw_encrypted TEXT,
    blog_id TEXT NOT NULL,
    
    -- 할당된 워커 ID
    assigned_worker TEXT DEFAULT 'worker-01',
    
    -- 쿠키 및 세션 정보
    cookies JSONB DEFAULT '{}',
    cookies_updated_at TIMESTAMPTZ,
    
    -- 메타데이터
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(user_id)
);

-- 인덱스 생성
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_user_credentials_user_id ON user_credentials(user_id);

-- updated_at 자동 업데이트 트리거 함수
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 트리거 적용
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_credentials_updated_at
    BEFORE UPDATE ON user_credentials
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 주석 추가
COMMENT ON TABLE users IS '사용자 기본 정보';
COMMENT ON TABLE user_credentials IS '사용자 네이버 인증 정보 (암호화 저장)';
