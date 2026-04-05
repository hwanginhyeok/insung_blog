# 성능 벤치마크

> 작성일: 2026-04-05
> 측정 환경: WSL2 Ubuntu, Intel i5, RAM 16GB

---

## 댓글 생성 성능

### Ollama (gemma3:4b, 로컬)

| 모드 | 3개 소요시간 | 분당 처리량 | 비용 |
|------|-------------|-----------|------|
| 순차 | 7.1초 | 25개/분 | 무료 |
| 병렬 (3) | 5.4초 | 33개/분 | 무료 |

- `OLLAMA_NUM_PARALLEL=3` (systemd 환경변수, Ollama 서버 설정)
- `OLLAMA_PARALLEL=3` (Python 코드, ThreadPoolExecutor)
- 모델: gemma3:4b (4B 파라미터, 가벼운 한국어 지원)
- 메모리: ~2.5GB VRAM 또는 RAM

### Anthropic API (Haiku 4.5)

| 모드 | 1개 소요시간 | 분당 처리량 | 월 비용 (100개/일) |
|------|-------------|-----------|-------------------|
| 단건 | ~0.5초 | ~120개/분 | ~₩6,000 |
| 배치 (3개) | ~1.5초 | ~120개/분 | ~₩6,000 |

- 모델: `claude-haiku-4-5-20251001`
- 입력: 시스템 프롬프트 (~500토큰) + 본문 (~400토큰) = ~900토큰
- 출력: ~150토큰 (120~200자 댓글)
- 비용: 입력 $0.80/MT + 출력 $4.00/MT → 1댓글당 ~₩2

### 폴백 체인

```
1차: Ollama (gemma3:4b) → 로컬, 무료, 25~33개/분
2차: Anthropic (Haiku 4.5) → API, 유료, ~120개/분
3차: phrases.py → 정적 문구, 즉시, 카테고리별 50개 풀
```

---

## 사용자 수별 인프라 요구사항

### 1명 (현재)

| 항목 | 값 |
|------|-----|
| 서버 | WSL2 (로컬 PC) |
| RAM 사용 | ~4GB (서비스 3개 + Playwright 3개) |
| 동시 브라우저 | 3개 |
| 일일 처리 | 블로거 10명, 댓글 30개 |
| 소요 시간 | 30~40분 |

### 10명 (단기)

| 항목 | 값 |
|------|-----|
| 서버 | WSL2 또는 VPS (4Core/16GB) |
| RAM 사용 | ~12GB |
| 동시 브라우저 | 3~4개 (Elastic Semaphore) |
| 일일 처리 | 총 블로거 100명, 댓글 300개 |
| 소요 시간 | ~160분 (3명씩 병렬) |
| 병목 | 허용 시간대(4시간) 내 처리 가능하나 빠듯 |

### 100명 (중기)

| 항목 | 값 |
|------|-----|
| 서버 | VPS 2~3대 (4Core/32GB 각) |
| RAM 사용 | ~60GB 분산 |
| 동시 브라우저 | 8~10개 (워커 2~3인스턴스) |
| 일일 처리 | 총 블로거 1,000명, 댓글 3,000개 |
| 소요 시간 | ~8시간 (시간대 분산 필수) |
| 병목 | 단일 워커 불가, Supabase 커넥션, 쿠키 관리 |

### 1000명 (장기)

| 항목 | 값 |
|------|-----|
| 서버 | 클라우드 클러스터 (10~20 노드) |
| RAM 사용 | ~256GB 분산 |
| 동시 브라우저 | 30~50개 (Auto-scaling) |
| 일일 처리 | 총 블로거 10,000명, 댓글 30,000개 |
| 소요 시간 | 24시간 분산 실행 |
| 병목 | 네이버 IP 차단 리스크, 브라우저 팜 비용, 쿠키 풀 관리 |

---

## 쿠키/브라우저 성능

| 항목 | 값 |
|------|-----|
| Playwright 세션당 메모리 | 300~500MB (headless Chromium) |
| 세션 생성 시간 | ~2초 |
| 쿠키 로드 시간 | <100ms (Supabase 조회 + AES 복호화) |
| 동시 실행 가능 수 (WSL2 16GB) | 3~4개 |
| 동시 실행 가능 수 (VPS 32GB) | 8~10개 |
| 페이지 로드 타임아웃 | 60초 (네이버 블로그 느림 대응) |
| 브라우저 재시작 주기 | 30건 처리마다 (메모리 누수 방지) |

### 브라우저 안정성

- **연속 실패 한도**: 5회 연속 실패 시 자동 중단 (셀렉터 깨짐/브라우저 크래시 판단)
- **조기 경고**: 3회 연속 실패 시 텔레그램 알림
- **NID_AUT 검증**: 로그인 후 NID_AUT 쿠키 존재 확인 → 없으면 1회 재시도 → 실패 시 즉시 중단 + 알림

---

## 병렬 처리 설정

### Ollama 병렬

| 환경변수 | 값 | 위치 |
|---------|-----|------|
| `OLLAMA_NUM_PARALLEL` | 3 | systemd 환경변수 (Ollama 서버 병렬 요청 수) |
| `OLLAMA_PARALLEL` | 3 | `.env` (Python ThreadPoolExecutor 워커 수) |

```python
# ai_comment.py
_OLLAMA_PARALLEL = int(os.environ.get("OLLAMA_PARALLEL", "3"))
# 배치 생성 시 ThreadPoolExecutor(max_workers=_OLLAMA_PARALLEL)
```

### Playwright 병렬 (Elastic Semaphore)

| 환경변수 | 기본값 | 설명 |
|---------|--------|------|
| `MAX_CONCURRENT_BROWSERS` | 3 | asyncio.Semaphore 한도 |

```python
# command_worker.py
MAX_CONCURRENT_BROWSERS = int(os.environ.get("MAX_CONCURRENT_BROWSERS", "3"))
_browser_semaphore = asyncio.Semaphore(MAX_CONCURRENT_BROWSERS)
```

**Elastic Semaphore 로직:**
- 유저 1명: 전체 슬롯 독점 (3개)
- 유저 2명: 각 1~2개 공정 분배
- 유저 3명+: 각 최소 1개 보장

### 딜레이 설정 (봇 감지 회피)

| 항목 | 최소 | 최대 | 위치 |
|------|------|------|------|
| 댓글 간 딜레이 | 5초 | 15초 | `config/settings.py` |
| 블로거 간 딜레이 | 30초 | 60초 | `config/settings.py` |
| 글자당 타이핑 딜레이 | 0.05초 | 0.15초 | `config/settings.py` |
| 게시 후 대기 | 3초 | 3초 | `command_worker.py` (asyncio.sleep) |

---

## 명령 워커 처리량

| 항목 | 값 |
|------|-----|
| 폴링 간격 | 10초 |
| 배치 크기 (브라우저 재시작) | 30건 |
| 연속 실패 한도 | 5회 |
| 진행 상황 업데이트 간격 | 5건마다 |
| 텔레그램 중간 보고 | 30건마다 |
| 종료 시그널 처리 | SIGINT/SIGTERM → 남은 댓글 approved 롤백 |
| 중복 실행 방지 | fcntl 파일 잠금 (data/worker.lock) |

### 지원 명령어

| 명령 | 브라우저 사용 | 한도 적용 | 설명 |
|------|:---:|:---:|------|
| `run` | O | O | 봇 1회 실행 (댓글 수집 + 생성) |
| `execute` | O | O | 승인된 댓글 일괄 게시 |
| `retry` | O | - | 재시도 큐 처리 |
| `publish` | O | - | 게시물 네이버 발행 |
| `save_draft` | O | - | 네이버 임시저장 |
| `visit_neighbors` | O | O | 이웃 방문 + 댓글 |
| `discover_and_visit` | O | O | 이웃 찾기 + 방문 + 댓글 |
| `auto_reply` | O | O | 대댓글 자동 답글 |
| `extract_blog_id` | O | - | 쿠키로 블로그 ID 추출 |
| `recommend_neighbors` | X | - | DB 기반 이웃 추천 |
