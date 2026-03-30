# 로그 분석 리포트

**분석일**: 2026-03-30 09:44
**분석 범위**: blog-worker / blog-api / blog-telegram (최근 300줄)

---

## 오늘 아침 execute 장애 타임라인

```
08:27:22  execute 시작 (242개 approved)
08:27:25  ⚠️  쿠키 경고 — NID_AUT 없음 (세션 쿠키 드롭됨)
08:28:34  [1/242] mtoriyam    — 댓글 입력창 없음 → failed
08:29:50  [2/242] ssongs_92   — 댓글 입력창 없음 → failed
08:31:02  [3/242] yerinee1297 — 댓글 입력창 없음 → failed
08:32:13  [4/242] yerinee1297 — 댓글 입력창 없음 → failed
08:33:24  [5/242] yerinee1297 — 댓글 입력창 없음 → failed
08:33:24  🔴 연속 5회 실패 → 237개 approved 롤백
08:33:50  execute 완료: 성공 0 / 실패 5
```

---

## 발견된 문제 (우선순위 순)

### 🔴 문제 1: "댓글 입력창 없음" → 전체 롤백 유발 (즉시 수정 완료)

**원인**:
- `comment_writer.py`에서 입력창 없으면 `return False, comment_text`
- `command_worker.py`에서 `False` 반환 시 `consecutive_failures += 1`
- 댓글 비활성화된 게시물이 연속으로 처리되면 5회 카운트 → 전체 롤백

**실제 피해**: 242개 중 5개 처리 후 237개 정상 댓글 롤백

**수정 완료** (2026-03-30):
- `comment_writer.py:213` → `return None, comment_text` (입력창 없음)
- `command_worker.py:322` → `elif ok is None:` 분기 추가 (카운터 증가 안 함)

**동작 변화**:
| 케이스 | 기존 | 수정 후 |
|--------|------|---------|
| 입력창 없음 | `consecutive_failures += 1` | 카운터 증가 안 함, `failed` 처리 |
| 기타 실패 | `consecutive_failures += 1` | 동일 |
| 성공 | `consecutive_failures = 0` | 동일 |

---

### 🔴 문제 2: 쿠키 세션 불완전 — NID_AUT 없음

**로그**: `쿠키 저장 스킵 (user=c0e219d4): NID_AUT 없음 — 기존 쿠키 유지 (context.cookies()에서 세션 쿠키 드롭됨)`

**분석**:
- Playwright `context.cookies()`에서 httpOnly 세션 쿠키가 반환되지 않음
- NID_AUT가 없으면 네이버 로그인 상태 불완전 → 댓글창이 안 보일 수 있음
- 어제 밤(성공 45개)과 오늘 아침(성공 0개)의 차이: 쿠키 만료 또는 드롭 여부

**개선 방안**:
- NID_AUT 없을 때 재로그인 시도 로직 추가
- 쿠키 만료 감지 → 강제 재로그인
- 야간 작업으로 처리 예정

---

### 🟠 문제 3: 댓글 입력창 없는 게시물에 70초 소비

**로그**: 각 실패 케이스마다 ~69~73초 소요 (08:27:25→08:28:34, 08:28:37→08:29:50 등)

**분석**:
- `_find_comment_input()` 내부의 타임아웃이 너무 길거나
- 페이지 로드 + 댓글 영역 열기에 불필요한 대기 발생
- 실패가 확정된 케이스에서도 전체 타임아웃까지 기다림

**개선 방안**:
- `_find_comment_input()` 타임아웃 줄이기 (현재 값 확인 필요)
- 빠른 실패(fail-fast) 로직: 페이지 로드 후 즉시 입력창 체크

---

### 🟠 문제 4: 텔레그램 봇 DNS 일시 오류 (WSL 환경)

**로그**: `Mar 27 04:08:51 [ERROR] telegram: 폴링 오류: [Errno -3] Temporary failure in name resolution`

**분석**:
- WSL2 환경에서 발생하는 DNS 간헐적 실패
- 자동 재시작(systemd restart policy)으로 복구됨
- 하지만 재시작까지 1일 20분 갭 (Mar 27 04:08 → Mar 28 17:57)

**개선 방안**:
- 폴링 오류 발생 시 즉시 재시도 + 지수 백오프
- DNS 오류는 네트워크 일시 장애이므로 3-5초 후 재시도 충분

---

### 🟡 문제 5: retry_queue에 추가되지 않는 "입력창 없음" 케이스

**분석**:
- 기존 코드: `ok=False` → `add_to_retry_queue()` 호출
- 수정 후: `ok=None` → retry_queue 추가 안 함
- 이게 의도에 맞음 (입력창 없는 게시물은 재시도해도 소용없음)
- 하지만 해당 블로거를 blocklist에 추가하거나 필터링하는 로직 없음

**개선 방안**:
- "입력창 없음" 블로거를 일정 기간 스킵하는 로직

---

## 야간 작업 추가 항목

1. **COOKIE-REFRESH**: NID_AUT 없음 감지 시 재로그인 로직 강화
2. **FAIL-FAST**: `_find_comment_input()` 타임아웃 최적화
3. **TELEGRAM-RETRY**: DNS 오류 시 즉시 재시도 + 백오프

---

## 즉시 수정 완료 항목

| 항목 | 파일 | 내용 |
|------|------|------|
| ✅ 입력창 없음 반환값 변경 | `src/commenter/comment_writer.py:213` | `False` → `None` |
| ✅ None 케이스 분기 추가 | `command_worker.py:322` | `elif ok is None:` 처리 |
| ✅ 워커 재시작 | `blog-worker.service` | 09:44:56 active |
