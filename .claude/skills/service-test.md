# 서비스 상태 확인 + E2E 테스트

> 트리거: "서비스 시작", "테스트 준비", "워커 띄워", "E2E 테스트", "서비스 확인"

## 핵심 원칙

**서비스 관리는 systemd만 사용한다.**
- `pkill -f command_worker.py` 금지 — systemd가 자동 재시작해서 충돌 발생
- `tmux kill-session -t blog` 금지 — 로그 관찰 창이 날아감
- `start_services.sh` 실행 금지 — tmux 기반 구버전, 더 이상 사용 안 함

## 1. 상태 확인 (먼저 실행)

```bash
systemctl --user status blog-api blog-worker blog-telegram
```

기대 결과: 3개 모두 `active (running)`

## 2. 개별 서비스 재시작 (필요 시만)

```bash
# 워커만 재시작
systemctl --user restart blog-worker

# API 서버만 재시작
systemctl --user restart blog-api

# 텔레그램 봇만 재시작
systemctl --user restart blog-telegram

# 전체 재시작
systemctl --user restart blog-api blog-worker blog-telegram
```

## 3. 실시간 로그 확인

```bash
# 워커 로그 (최근 20줄 + 스트리밍)
journalctl --user -u blog-worker -n 20 -f --no-pager

# API 서버 로그
journalctl --user -u blog-api -n 20 -f --no-pager

# 텔레그램 봇 로그
journalctl --user -u blog-telegram -n 20 -f --no-pager
```

tmux `blog:worker` 창에는 `journalctl --user -u blog-worker -f` 가 실행 중이므로 해당 창으로 전환해서 확인해도 됨.

## 4. 기동 확인

```bash
# 프로세스 PID 확인
systemctl --user status blog-api blog-worker blog-telegram | grep "Main PID"

# 워커 프로세스 1개만 있는지 확인 (2개면 문제)
ps aux | grep command_worker | grep -v grep | wc -l  # → 반드시 1
```

워커가 2개 이상이면:
```bash
systemctl --user stop blog-worker
pkill -f "command_worker.py" 2>/dev/null
sleep 2
systemctl --user start blog-worker
```

## 5. 서비스 중단 (장기 중지 필요 시)

```bash
systemctl --user stop blog-api blog-worker blog-telegram
```

재개:
```bash
systemctl --user start blog-api blog-worker blog-telegram
```

## 6. Next.js 웹앱 (테스트 시만)

```bash
tmux new-window -t blog -n "web" -c "/home/window11/insung_blog/apps/web"
tmux send-keys -t blog:web "npm run dev -- -p 3002" Enter
```

## 7. E2E 테스트 시나리오

### 댓글 봇 테스트
1. `/bot` 페이지 → 봇 실행 버튼
2. 워커 로그 확인: `journalctl --user -u blog-worker -n 20 --no-pager`
3. `━━━ 명령 실행: run` 확인 → 방문/댓글 생성 진행

### 게시물 발행 테스트
1. `http://localhost:3002` 로그인
2. `/write` → 사진 업로드 + 메모 → AI 초안 생성
3. **저장** → **"네이버 발행"** 클릭
4. `journalctl --user -u blog-worker -n 5 --no-pager` 에서 `▶ 게시물 발행 시작` 확인

## 8. 장애 진단

워커가 계속 재시작되는 경우:
```bash
# 최근 오류 확인
journalctl --user -u blog-worker -n 50 --no-pager | grep -E "ERROR|WARNING|exit"

# restart counter 확인 (비정상적으로 높으면 코드 오류 의심)
journalctl --user -u blog-worker --no-pager | grep "restart counter" | tail -5
```
