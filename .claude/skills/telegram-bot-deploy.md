# 텔레그램 봇 배포/교체

> 트리거: "봇 배포", "봇 교체", "텔레그램 업데이트"

## 절차

### 1. 구문 검증
```bash
cd /home/window11/insung_blog
source .venv/bin/activate
python -c "import py_compile; py_compile.compile('telegram_bot.py', doraise=True)"
```

### 2. systemd 서비스 재시작
```bash
systemctl --user restart blog-telegram
sleep 2
systemctl --user status blog-telegram | grep -E "●|Active:"
```

### 3. 동작 확인
- 텔레그램에서 `/status` 전송 → 정상 응답 확인
- 로그에서 "폴링 루프 시작" 메시지 확인:
  ```bash
  journalctl --user -u blog-telegram -n 10 --no-pager
  ```

### 4. 롤백 (문제 발생 시)
```bash
# git에서 이전 버전 복원
cd /home/window11/insung_blog
git checkout HEAD~1 -- telegram_bot.py

# 서비스 재시작
systemctl --user restart blog-telegram
sleep 2
systemctl --user status blog-telegram | grep -E "●|Active:"
```

## 주의사항
- 봇 교체 시 getUpdates offset이 유지되므로 메시지 유실 없음
- worker(command_worker.py)는 독립적이므로 재시작 불필요
- 봇 토큰 변경 시 .env 수정 후 전체 재시작 필요:
  `systemctl --user restart blog-api blog-worker blog-telegram`
