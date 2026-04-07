#!/bin/bash
# 매일 자동 댓글 수집 cron 래퍼
cd /home/window11/insung_blog
set -a && source .env && set +a
exec .venv/bin/python scripts/daily_discover.py
