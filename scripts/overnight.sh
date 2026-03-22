#!/bin/bash
# ============================================================
# 야간 자동 작업 실행기
# 사용법: bash scripts/overnight.sh [프롬프트파일]
#
# 예시:
#   bash scripts/overnight.sh                              # 기본 프롬프트
#   bash scripts/overnight.sh scripts/tonight_prompt.txt   # 커스텀 프롬프트
# ============================================================

set -euo pipefail

SESSION="claude-overnight"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="$PROJECT_DIR/logs"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_FILE="$LOG_DIR/overnight_${TIMESTAMP}.log"

mkdir -p "$LOG_DIR"

# 이미 실행 중이면 알림
if tmux has-session -t "$SESSION" 2>/dev/null; then
    echo "이미 야간 작업 실행 중: tmux attach -t $SESSION"
    exit 1
fi

# 프롬프트 파일 결정
PROMPT_FILE="${1:-$PROJECT_DIR/scripts/default_overnight_prompt.txt}"

if [ ! -f "$PROMPT_FILE" ]; then
    echo "프롬프트 파일 없음: $PROMPT_FILE"
    exit 1
fi

# tmux 세션에서 claude 실행
tmux new-session -d -s "$SESSION" \
    "cd $PROJECT_DIR && cat '$PROMPT_FILE' | claude -p --dangerously-skip-permissions 2>&1 | tee $LOG_FILE; echo ''; echo '=== 야간 작업 완료 ==='; echo '로그: $LOG_FILE'; sleep 86400"

echo "============================================"
echo "  야간 자동 작업 시작됨"
echo "============================================"
echo "  세션:  tmux attach -t $SESSION"
echo "  로그:  $LOG_FILE"
echo "  프롬프트: $PROMPT_FILE"
echo "  중단:  tmux kill-session -t $SESSION"
echo "============================================"
