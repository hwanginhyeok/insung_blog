# 댓글 봇 상태 확인 스킬 (bot-health-check)

> **트리거**: 아래 표현이 나오면 이 스킬을 즉시 실행한다.
> - "봇 상태" / "봇 확인" / "댓글봇 체크"
> - "봇 살아있어?" / "봇 정상이야?"
> - "크론 확인" / "cron 상태"
> - 세션 시작 시 운영 상태 점검으로 자동 제안 가능

---

## 목적

Cron으로 매일 실행되는 댓글 봇(평일 20:30, 주말 13:30)의 상태를 점검한다.
실패 알림이 별도로 없기 때문에 수동 점검이 유일한 모니터링 수단이다.

---

## 실행 순서 (순서 준수 필수)

### STEP 1 — tmux 세션 확인

```bash
tmux ls 2>/dev/null | grep blog
```

| 결과 | 의미 |
|------|------|
| `blog: 4 windows` | 정상 (api, telegram, worker, web) |
| `blog: N windows` (N≠4) | 일부 프로세스 누락 |
| 세션 없음 | 봇 미실행 — 재시작 필요 |

### STEP 2 — 각 프로세스 생존 확인

```bash
# tmux blog 세션의 각 윈도우 상태 확인
tmux list-windows -t blog 2>/dev/null
```

예상 윈도우:
- `api` — FastAPI 서버 (포트 8001)
- `telegram` — 텔레그램 봇
- `worker` — 댓글 봇 워커
- `web` — Next.js 웹앱 (포트 3002)

프로세스 직접 확인:
```bash
# API 서버
curl -s http://localhost:8001/health 2>/dev/null || echo "API DOWN"

# 웹 서버
curl -s http://localhost:3002 2>/dev/null | head -1 || echo "WEB DOWN"
```

### STEP 3 — 최근 실행 로그 확인

```bash
# 최근 로그 파일 확인
ls -lt logs/ 2>/dev/null | head -5

# 최근 로그에서 에러 확인
tail -50 logs/latest.log 2>/dev/null | grep -i "error\|fail\|exception"
```

확인 포인트:
- 마지막 실행 시각이 예상 Cron 시각과 일치하는가
- ERROR/FAIL 로그가 있는가
- "댓글 작성 완료" 같은 성공 로그가 있는가

### STEP 4 — DB 최근 기록 확인

```bash
sqlite3 data/comments.db "SELECT * FROM comment_log ORDER BY created_at DESC LIMIT 5;"
```

| 확인 항목 | 기준 |
|----------|------|
| 최근 기록 시각 | 24시간 이내여야 정상 (평일 기준) |
| 댓글 수 | 0이면 실행은 됐으나 대상 없었거나 실패 |
| 에러 기록 | error 컬럼에 값이 있으면 분석 필요 |

### STEP 5 — 쿠키 유효성 확인

```bash
# 쿠키 파일 존재 + 수정일 확인
ls -la cookies/ 2>/dev/null

# 쿠키 만료 시각 확인 (JSON 내 expires 필드)
python3 -c "
import json, os, time
for f in os.listdir('cookies'):
    if f.endswith('.json'):
        data = json.load(open(f'cookies/{f}'))
        for c in data:
            if c.get('name') == 'NID_AUT':
                exp = c.get('expires', 0)
                remain = exp - time.time()
                print(f'{c[\"name\"]}: {remain/3600:.0f}h 남음' if remain > 0 else f'{c[\"name\"]}: 만료됨')
" 2>/dev/null
```

NID_AUT 만료 = 로그인 무효 → `cookie-refresh` 스킬로 전환.

### STEP 6 — 결과 요약

```
🤖 댓글 봇 상태 — {날짜}

| 항목 | 상태 | 상세 |
|------|------|------|
| tmux 세션 | ✅ 정상 | blog: 4 windows |
| API 서버 | ✅ 정상 | :8001 응답 |
| 웹 서버 | ✅ 정상 | :3002 응답 |
| 최근 실행 | ✅ 정상 | 어제 20:30 실행, 댓글 12건 |
| 쿠키 | ⚠️ 주의 | NID_AUT 48h 남음 |
| DB 기록 | ✅ 정상 | 최근 24h 내 기록 존재 |

종합: ✅ 정상 운영 (쿠키 갱신 2일 내 필요)
```

---

## 판단 규칙

| 상황 | 행동 |
|------|------|
| 전체 정상 | 요약 한 줄 |
| 쿠키 48h 미만 | ⚠️ 경고 + `cookie-refresh` 스킬 제안 |
| tmux 세션 없음 | ❌ 재시작 절차 안내 |
| DB 24h+ 미기록 | ❌ 로그 분석 → 원인 파악 |
| API/웹 다운 | ❌ 해당 프로세스 재시작 안내 |
| 로그에 셀렉터 에러 | `selector-debug` 스킬로 전환 제안 |

---

## 주의사항

- 이 스킬은 읽기 전용이다. 프로세스를 재시작하거나 파일을 수정하지 않는다
- Cron 스케줄 확인: `crontab -l | grep main.py`
- DB 경로: `data/comments.db` (프로젝트 루트 기준)
- 쿠키 경로: `cookies/` (프로젝트 루트 기준)
