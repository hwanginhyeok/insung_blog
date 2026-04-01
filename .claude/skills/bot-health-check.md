# 댓글 봇 상태 확인 스킬 (bot-health-check)

> **트리거**: 아래 표현이 나오면 이 스킬을 즉시 실행한다.
> - "봇 상태" / "봇 확인" / "댓글봇 체크"
> - "봇 살아있어?" / "봇 정상이야?"
> - 세션 시작 시 운영 상태 점검으로 자동 제안 가능

---

## 목적

systemd로 관리되는 3개 서비스(blog-api, blog-worker, blog-telegram)의 상태를 점검한다.

---

## 실행 순서 (순서 준수 필수)

### STEP 1 — systemd 서비스 상태 확인

```bash
systemctl --user status blog-api blog-worker blog-telegram | grep -E "●|Active:|Main PID:"
```

| 결과 | 의미 |
|------|------|
| 3개 모두 `active (running)` | 정상 |
| inactive/failed 있음 | 해당 서비스 재시작 필요 |

### STEP 2 — API 서버 응답 확인

```bash
# API 서버
curl -s http://localhost:8001/health 2>/dev/null || echo "API DOWN"
```

### STEP 3 — 워커 프로세스 중복 확인

```bash
# 워커가 정확히 1개만 실행 중인지 확인 (2개 이상이면 문제)
ps aux | grep command_worker | grep -v grep | wc -l  # 반드시 1
```

### STEP 4 — 최근 실행 로그 확인

```bash
# systemd 저널에서 최근 워커 로그 확인
journalctl --user -u blog-worker -n 20 --no-pager

# 에러만 필터링
journalctl --user -u blog-worker --since "24 hours ago" --no-pager | grep -i "error\|fail\|exception"
```

확인 포인트:
- ERROR/FAIL 로그가 있는가
- "댓글 작성 완료" 같은 성공 로그가 있는가

### STEP 5 — DB 최근 기록 확인

```bash
cd /home/window11/insung_blog
sqlite3 data/comments.db "SELECT * FROM comment_log ORDER BY created_at DESC LIMIT 5;"
```

| 확인 항목 | 기준 |
|----------|------|
| 최근 기록 시각 | 24시간 이내여야 정상 (평일 기준) |
| 댓글 수 | 0이면 실행은 됐으나 대상 없었거나 실패 |
| 에러 기록 | error 컬럼에 값이 있으면 분석 필요 |

### STEP 6 — 쿠키 유효성 확인

```bash
cd /home/window11/insung_blog
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

### STEP 7 — 결과 요약

```
댓글 봇 상태 — {날짜}

| 항목 | 상태 | 상세 |
|------|------|------|
| blog-api | OK/NG | :8001 응답 여부 |
| blog-worker | OK/NG | active (running), PID 1개 |
| blog-telegram | OK/NG | active (running) |
| 최근 실행 | OK/NG | 마지막 실행 시각 + 결과 |
| 쿠키 | OK/주의 | NID_AUT 잔여 시간 |
| DB 기록 | OK/NG | 최근 24h 내 기록 존재 여부 |
```

---

## 판단 규칙

| 상황 | 행동 |
|------|------|
| 전체 정상 | 요약 한 줄 |
| 쿠키 48h 미만 | 경고 + `cookie-refresh` 스킬 제안 |
| 서비스 inactive/failed | 즉시 `systemctl --user restart` |
| DB 24h+ 미기록 | 로그 분석 → 원인 파악 |
| API 다운 | `systemctl --user restart blog-api` |
| 로그에 셀렉터 에러 | `selector-debug` 스킬로 전환 제안 |

---

## 주의사항

- 이 스킬은 읽기 전용이다. 프로세스를 재시작하거나 파일을 수정하지 않는다
- DB 경로: `data/comments.db` (프로젝트 루트 기준)
- 쿠키 경로: `cookies/` (프로젝트 루트 기준)
