# 서비스 시작 + E2E 테스트

> 트리거: "서비스 시작", "테스트 준비", "워커 띄워", "E2E 테스트"

## 1. 사전 정리

```bash
# 기존 워커 중복 방지
pkill -f "command_worker.py" 2>/dev/null
rm -f data/worker.lock
sleep 1

# 기존 blog 세션 정리
tmux kill-session -t blog 2>/dev/null
```

## 2. 서비스 시작 (tmux blog 세션)

```bash
bash scripts/start_services.sh
```

이 스크립트가 띄우는 창:
| 창 | 이름 | 명령 |
|----|------|------|
| 0 | api | `uvicorn api_server:app --port 8001` |
| 1 | telegram | `python telegram_bot_simple.py` |
| 2 | worker | `python command_worker.py` |

## 3. Next.js 웹앱 추가 (테스트 시만)

```bash
tmux new-window -t blog -n "web" -c "$(pwd)/apps/web"
tmux send-keys -t blog:web "npm run dev -- -p 3002" Enter
```

## 4. 기동 확인 (반드시 수행)

```bash
# 프로세스 확인 (4개 모두 떠야 함)
ps aux | grep -E "command_worker|uvicorn|telegram_bot|next" | grep -v grep

# 워커 1개만 떠있는지 확인
ps aux | grep command_worker | grep -v grep | wc -l  # → 1

# 워커 로그 확인
tmux capture-pane -t blog:worker -p -S -10
```

## 5. 로그 모니터링

테스트 중 워커/API 로그 실시간 확인:

```bash
# 워커 로그
tmux capture-pane -t blog:worker -p -S -30

# API 서버 로그
tmux capture-pane -t blog:api -p -S -30

# 웹앱 로그
tmux capture-pane -t blog:web -p -S -20
```

## 6. 서비스 종료

```bash
tmux kill-session -t blog
```

## 7. E2E 테스트 시나리오

### 게시물 발행 테스트
1. `http://localhost:3002` 로그인
2. `/write` → 사진 업로드 + 메모 → AI 초안 생성
3. **저장** 클릭 → savedId 생성
4. **"네이버 발행"** 초록 버튼 확인 → 클릭
5. 워커 로그에서 `▶ 게시물 발행 시작` 확인
6. 완료 후 UI에 블로그 URL 표시 확인

### 댓글 봇 테스트
1. `/bot` 페이지 → 실행 버튼
2. 워커 로그에서 `━━━ 명령 실행: run` 확인
3. 완료 후 결과 표시 확인

## 주의사항

- 워커는 반드시 **1개만** 실행. `wc -l` 결과가 2 이상이면 `pkill -f command_worker` 후 재시작.
- `data/worker.lock`이 남아있으면 `rm -f data/worker.lock` 후 재시작.
- Next.js 포트: 3002 (3000/3001은 다른 프로젝트 사용 중일 수 있음).
