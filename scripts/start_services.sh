#!/bin/bash
# 블로그 자동화 서비스 시작 (tmux 백그라운드)
# 사용법: bash scripts/start_services.sh

SESSION="blog"

# 이미 실행 중이면 알림
if tmux has-session -t $SESSION 2>/dev/null; then
    echo "이미 실행 중: tmux attach -t $SESSION 으로 확인"
    exit 0
fi

PROJECT_DIR="/home/gint_pcd/projects/인성이프로젝트"

# 세션 생성 + api_server (창 0)
tmux new-session -d -s $SESSION -n "api" -c "$PROJECT_DIR"
tmux send-keys -t $SESSION:api "source .venv/bin/activate && uvicorn api_server:app --port 8001" Enter

# 텔레그램 봇 (창 1)
tmux new-window -t $SESSION -n "telegram" -c "$PROJECT_DIR"
tmux send-keys -t $SESSION:telegram "source .venv/bin/activate && python telegram_bot_simple.py" Enter

# 명령 큐 워커 (창 2)
tmux new-window -t $SESSION -n "worker" -c "$PROJECT_DIR"
tmux send-keys -t $SESSION:worker "source .venv/bin/activate && python command_worker.py" Enter

echo "서비스 시작 완료!"
echo "  API 서버:    tmux select-window -t $SESSION:api"
echo "  텔레그램 봇: tmux select-window -t $SESSION:telegram"
echo "  명령 워커:   tmux select-window -t $SESSION:worker"
echo "  확인:        tmux attach -t $SESSION"
echo "  종료:        tmux kill-session -t $SESSION"
