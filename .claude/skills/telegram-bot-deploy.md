# 텔레그램 봇 배포/교체

> 텔레그램 봇 업데이트 시 절차

## 절차

### 1. 구문 검증
```bash
cd /home/window11/insung_blog
source .venv/bin/activate
python -c "import py_compile; py_compile.compile('telegram_bot.py', doraise=True)"
```

### 2. tmux telegram 창 중지
```bash
tmux send-keys -t blog:telegram C-c
sleep 2
```

### 3. 새 봇 시작
```bash
tmux send-keys -t blog:telegram "python telegram_bot.py" Enter
```

### 4. 동작 확인
- 텔레그램에서 `/status` 전송 → 정상 응답 확인
- tmux 로그에서 "폴링 루프 시작" 메시지 확인

### 5. 롤백 (문제 발생 시)
```bash
# git에서 이전 버전 복원
git checkout HEAD~1 -- telegram_bot.py

# 또는 telegram_bot_simple.py로 대체
tmux send-keys -t blog:telegram C-c
sleep 2
tmux send-keys -t blog:telegram "python telegram_bot_simple.py" Enter
```

## 주의사항
- 봇 교체 시 getUpdates offset이 유지되므로 메시지 유실 없음
- worker(command_worker.py)는 독립적이므로 재시작 불필요
- 봇 토큰 변경 시 .env 수정 후 전체 재시작 필요
