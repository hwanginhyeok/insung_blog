#!/bin/bash
# 블로그 자동화 서비스 관리 (systemd 기반)
# 사용법: bash scripts/start_services.sh [start|stop|restart|status]
#
# 주의: 서비스는 systemd로만 관리한다.
# pkill -f command_worker.py 사용 금지 — systemd가 자동 재시작해서 충돌 발생

ACTION=${1:-status}

case "$ACTION" in
  start)
    echo "서비스 시작..."
    systemctl --user start blog-api blog-worker blog-telegram
    sleep 2
    systemctl --user status blog-api blog-worker blog-telegram | grep -E "●|Active:"
    ;;
  stop)
    echo "서비스 중단..."
    systemctl --user stop blog-api blog-worker blog-telegram
    systemctl --user status blog-api blog-worker blog-telegram | grep -E "●|Active:"
    ;;
  restart)
    echo "서비스 재시작..."
    systemctl --user restart blog-api blog-worker blog-telegram
    sleep 2
    systemctl --user status blog-api blog-worker blog-telegram | grep -E "●|Active:"
    ;;
  status|*)
    systemctl --user status blog-api blog-worker blog-telegram | grep -E "●|Active:|Main PID"
    echo ""
    echo "워커 프로세스 수: $(ps aux | grep command_worker | grep -v grep | wc -l) (정상=1)"
    ;;
esac
