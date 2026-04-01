# 텔레그램 봇 E2E 테스트

> 텔레그램 봇 변경 후 수동 E2E 체크리스트

## 사전 조건
- systemd 서비스 3개(blog-api, blog-worker, blog-telegram) 모두 `active (running)`
  ```bash
  systemctl --user status blog-api blog-worker blog-telegram | grep "Active:"
  ```
- Supabase에 bot_settings.telegram_chat_id 컬럼 존재
- 관리자 chat_id 매핑 완료

## 체크리스트

### 1. /start 등록 플로우
- [ ] 미등록 사용자가 /start → "블로그 ID 입력" 응답
- [ ] 블로그 ID 입력 → "등록 완료!" 응답
- [ ] 이미 등록된 사용자가 /start → "이미 등록" 응답
- [ ] 잘못된 블로그 ID → "등록되지 않은 블로그 ID" 응답

### 2. /status 동작
- [ ] /status → 오늘 현황 (댓글 수, 방문 수, 대기 큐) 정상 표시

### 3. /run → 큐 등록 + 완료 알림
- [ ] /run → "등록되었습니다" 응답
- [ ] worker가 명령 감지 → 실행
- [ ] 완료 후 "봇 실행 완료" 알림 수신

### 4. /pending → 인라인 버튼 → /execute
- [ ] /pending → 승인 대기 목록 + 버튼 표시
- [ ] 승인 버튼 → "승인되었습니다" 응답
- [ ] /execute → "등록되었습니다" → 완료 알림

### 5. /discover → 이웃 발견 알림
- [ ] /discover 맛집 → "등록되었습니다"
- [ ] 완료 → "이웃 발견: N명" 알림

### 6. 사진 전송 → AI 초안
- [ ] 사진 1장 전송 → "AI 초안 생성 중..."
- [ ] HTML 프리뷰 + 파일 수신

### 7. 미등록 사용자 차단
- [ ] 미등록 chat_id에서 /status → "등록되지 않은 사용자" 응답
- [ ] 미등록 chat_id에서 사진 전송 → 차단

## 디버그
```bash
# systemd 로그 확인
journalctl --user -u blog-telegram -n 30 --no-pager
journalctl --user -u blog-worker -n 30 --no-pager

# Supabase bot_commands 확인
# 웹 대시보드에서 bot_commands 테이블 조회
```
