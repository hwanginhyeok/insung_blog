-- bot_settings에 서로이웃 관련 설정 추가
ALTER TABLE bot_settings
  ADD COLUMN IF NOT EXISTS auto_neighbor_request BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS max_neighbor_requests_per_day INTEGER DEFAULT 10,
  ADD COLUMN IF NOT EXISTS neighbor_request_message TEXT;
