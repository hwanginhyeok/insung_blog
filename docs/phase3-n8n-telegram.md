# Phase 3 — n8n + 텔레그램 연동

> 태스크: #7
> 선행 조건: Phase 1, 2 완료

---

## 목표

텔레그램이 모든 입력/출력 UI가 되고,
n8n이 흐름을 조율하며, Python 봇들을 HTTP로 호출.

---

## 설치

### n8n 실행 (Docker 불필요)

```bash
# 최초 설치
npm install -g n8n

# 실행
n8n start

# 접속
http://localhost:5678
```

### 텔레그램 봇 생성

1. 텔레그램에서 `@BotFather` 채팅
2. `/newbot` 명령
3. 이름 입력 → Bot Token 발급 (`1234567890:AAF...`)
4. `.env`에 추가:
   ```
   TELEGRAM_BOT_TOKEN=1234567890:AAF...
   TELEGRAM_CHAT_ID=본인_채팅_ID  # @userinfobot 으로 확인
   ```

---

## 워크플로 1 — 글 작성 플로우

### 트리거: 텔레그램 메시지

```
사용자가 텔레그램 봇에 전송:
  - 사진 1~5장
  - 텍스트 메모 (선택): "강남 이탈리안, 파스타 2만원, 분위기 좋음"
```

### n8n 노드 구성

```
[Telegram Trigger]
    │  사진(binary) + 텍스트 수신
    ▼
[Code 노드]  이미지를 base64로 변환
    │
    ▼
[HTTP Request]  content_generator.py 웹훅 호출
    │  POST http://localhost:8001/generate
    │  Body: { images: [...], memo: "..." }
    ▼
[Wait]  AI 생성 완료 대기
    │
    ▼
[Telegram 노드]  초안 전송
    │  메시지: [초안 전문]
    │  버튼: [✅ 게시] [✏️ 수정] [🔄 다시쓰기]
    ▼
[Telegram Trigger]  버튼 응답 대기
    │
    ├─ ✅ 게시 ──────────────────────────────────┐
    │                                            ▼
    │                              [HTTP Request]
    │                              blog_publisher.py 호출
    │                              POST http://localhost:8001/publish
    │                                            ▼
    │                              [Telegram 노드]
    │                              "게시 완료 ✓ [URL]"
    │                              "피드백 남겨주세요 (선택)"
    │
    ├─ ✏️ 수정 ──────────────────────────────────┐
    │                                            ▼
    │                              [Telegram 노드]
    │                              "수정 내용을 입력해주세요"
    │                                            ▼
    │                              [HTTP Request]  재생성
    │
    └─ 🔄 다시쓰기 ──→ 처음부터 재생성
```

### Python 측 웹훅 서버 (publisher_main.py)

```python
# FastAPI 또는 간단한 HTTP 서버
from fastapi import FastAPI
app = FastAPI()

@app.post("/generate")
async def generate(data: GenerateRequest):
    # content_generator.py 호출
    result = await generate_post(data.images, data.memo)
    return result

@app.post("/publish")
async def publish(data: PublishRequest):
    # blog_publisher.py 호출
    url = await publish_post(data.title, data.body, data.images, data.hashtags)
    return {"url": url}
```

---

## 워크플로 2 — 댓글 봇 제어

### 텔레그램 명령어

| 명령어 | 동작 |
|--------|------|
| `/start_comment` | 댓글 봇 즉시 실행 |
| `/stop_comment` | 댓글 봇 중지 |
| `/status` | 오늘 방문/댓글 현황 |

### n8n 노드 구성

```
[Telegram Trigger]  명령어 수신
    │
    ├─ /start_comment
    │       ▼
    │   [Execute Command]
    │   python main.py --run-once
    │       ▼
    │   [Telegram 노드]  완료 알림
    │
    ├─ /stop_comment
    │       ▼
    │   [Execute Command]
    │   pkill -f "main.py"
    │
    └─ /status
            ▼
        [HTTP Request]  GET http://localhost:8001/status
            ▼
        [Telegram 노드]
        "오늘 방문: 5명 / 댓글: 12개 성공 / 0개 실패"
```

### 자동 실행 스케줄

```
[Schedule Trigger]  매일 20:30
    ▼
[Execute Command]
python main.py --run-once
    ▼
[Telegram 노드]
"댓글 봇 실행 완료 — 방문: N명, 댓글: N개"
```

---

## 알림 설정

| 이벤트 | 알림 |
|--------|------|
| 댓글 봇 실행 완료 | ✅ 방문/댓글 수 요약 |
| 오류 발생 | ⚠️ 오류 메시지 |
| 게시 완료 | ✅ 게시된 URL |
| 로그인 실패 | 🚨 즉시 알림 |

---

## 파일 구조 추가

```
인성이프로젝트/
├── publisher_main.py       # FastAPI 웹훅 서버
└── n8n/
    └── workflows/
        ├── blog_post_flow.json     # 글 작성 워크플로 (n8n export)
        └── comment_bot_flow.json   # 댓글 봇 워크플로 (n8n export)
```

---

## 실행 순서 (운영 시)

```bash
# 터미널 1: n8n
n8n start

# 터미널 2: Python 웹훅 서버
source .venv/bin/activate
uvicorn publisher_main:app --port 8001

# 댓글 봇은 n8n 스케줄 또는 텔레그램 명령으로 실행
```
