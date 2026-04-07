# 비즈니스 성장 계획 — 조사 결과 + 구현 설계

> 조사일: 2026-04-07
> 관련 태스크: MARKETING-01, BIZ-MODEL, NOTIFY-KAKAO, VISITOR-TRACK

---

## 1. VISITOR-TRACK — 블로그 방문자수 수집

### 수집 방법 (검증 완료)

`https://m.blog.naver.com/{blogId}` GET → HTML 내 `window.__INITIAL_STATE__` JSON 파싱

- 로그인/API키 **불필요**, Playwright **불필요** (단순 httpx GET)
- 추출 필드: `dayVisitorCount`, `totalVisitorCount`, `subscriberCount`
- 테스트 검증: letter_hih(오늘 2명/전체 214명), mardukas(6,945명/81M)

### 초기화 타이밍 대응

네이버 일일 방문자수 초기화 시각: **자정 00:00 KST 확인 (2026-04-08 실측)**

실측 결과 (00:02 수집):
- `letter_hih: 오늘=0` ← 자정 리셋 확인
- `youyoubear0517: 오늘=2` ← 자정 후 이미 2명 방문

### 수집 전략

| 전략 | 수집 시각 | 장점 | 단점 |
|------|----------|------|------|
| **A. 자정 직전 1회** | 23:50 | 하루 최종값, 정확 | 서버 장애 시 누락 |
| **B. 다중 수집 + MAX** | 09:00, 15:00, 23:50 | 장애 내성 | API 호출 3배 |
| **C. 자정 직전 + 직후** | 23:50, 00:05 | 당일 확정 + 다음날 시작 확인 | 2회 |

**추천: B안 (다중 수집 + MAX)**
- 일 3회 수집 → 같은 날짜 중 MAX 값을 "확정 방문자수"로 사용
- 23:50이 가장 정확하지만, 장애 대비로 낮 시간대도 수집
- 사용자 수 × 3회/일 = 10명이면 30req/일, 차단 리스크 없음

### DB 스키마

```sql
-- Supabase 마이그레이션
CREATE TABLE blog_visitor_stats (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  blog_id text NOT NULL,
  date date NOT NULL DEFAULT CURRENT_DATE,
  day_visitor_count int,
  total_visitor_count bigint,
  subscriber_count int,
  collected_at timestamptz DEFAULT now(),
  UNIQUE(user_id, blog_id, date)
);

-- 같은 날 여러 번 수집 시 UPDATE (UPSERT)
-- day_visitor_count = GREATEST(기존값, 새값)

ALTER TABLE blog_visitor_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "사용자 본인 데이터만 조회"
  ON blog_visitor_stats FOR SELECT
  USING (auth.uid() = user_id);
```

### 수집 코드 (Python)

```python
import httpx, json, re

async def fetch_visitor_count(blog_id: str) -> dict | None:
    url = f"https://m.blog.naver.com/{blog_id}"
    resp = await httpx.AsyncClient().get(url)
    match = re.search(r'window\.__INITIAL_STATE__\s*=\s*({.*?});', resp.text)
    if not match:
        return None
    data = json.loads(match.group(1))
    info = data["blogHome"]["blogHomeInfo"][blog_id]["data"]
    return {
        "day_visitor_count": info["dayVisitorCount"],
        "total_visitor_count": info["totalVisitorCount"],
        "subscriber_count": info.get("subscriberCount", 0),
    }
```

### UI

- 웹 대시보드에 Chart.js 일별 방문자 추이 그래프
- 주간/월간 성장률 자동 계산
- "서비스 사용 전 vs 후" 비교 기능 (가입일 기준)

---

## 2. MARKETING-01 — 마케팅 홍보 방안

### AI 명시 전략

- **AI 기본법(2026.1)**: AI 생성물 표시 의무화. 미표시 시 과태료 최대 3,000만원
- **네이버 제재 기준**: AI 자체가 아니라 "저품질 대량 포스팅"이 타겟. 독창성+전문성 있으면 OK
- **권장 문구**: 글 하단 `"이 글은 [서비스명] AI의 도움을 받아 작성했습니다"` + 서비스 링크

### 초기 10명 확보 채널

| 채널 | 기대 효과 | 비용 |
|------|----------|------|
| 본인 블로그 dogfooding | 실사용 증명, 가장 설득력 | 0원 |
| 네이버 카페 (블수모, 블로거협회) | 타겟 정확, 체험기 형태 | 0원 |
| 아이보스 | 마케터 커뮤니티, 사례 공유 | 0원 |
| 크몽 체험단 | 무료 체험 → 후기 교환 | 0원 |

### 가격 설정

| 구간 | 가격 | 근거 |
|------|------|------|
| 초기 10명 | 무료 | 피드백 수집 + 후기 확보 |
| 일반 | **월 19,900원** | 경쟁사 진입가 9,900~29만원 중간 |
| Pro | **월 39,900원** | 고급 기능 (페르소나 무제한, 우선 처리) |

---

## 3. BIZ-MODEL — 체험단 비즈니스 모델

### 시장 현황

| 플랫폼 | 블로거 수 | 가게 과금 |
|--------|----------|----------|
| 레뷰(REVU) | 122만 | 셀프 월 5.2~18.8만, 대행 건당 20~100만 |
| 리뷰노트 | 월 50만 이용자 | 광고주 과금 |
| 미블 | 비공개 | 광고주 과금 + 패널티 |

### 수익 모델 설계

```
Phase 1 — 블로거 확보 (AI 도구 무료/유료)
    ↓
Phase 2 — 가게 무료 알선 (네이버 플레이스 리뷰 0~2개 신규 가게 타겟)
    ↓
Phase 3 — 유료 컨설팅
    ├── 단순 진단: 5~10만원 (키워드 분석, SNS 진단)
    ├── 실무 전략: 30~50만원 (경쟁사 분석, 콘텐츠 방향)
    └── 종합 컨설팅: 100만원+ (브랜드 포지셔닝, 캠페인)
```

### 법적 의무

- 게시물 첫 부분에 **"대가성 광고" 필수 명시** (공정거래법)
- 2025년부터 미래/조건부 대가도 공개 의무
- 위반 시 과태료 부과

### MVP 기능 목록 (Phase 2 최소 출시)

1. **가게 등록**: 업종/위치/요청사항 입력 폼
2. **블로거 매칭**: 지역+카테고리+영향력 기반 자동 추천
3. **캠페인 생성**: 가게 → 모집 조건(기간, 인원, 혜택) 설정
4. **매칭 수락/거절**: 블로거가 캠페인 참여 결정
5. **리뷰 제출**: 블로그 URL 등록 + 광고표시 자동 검증
6. **가게 대시보드**: 리뷰 현황, 방문자수 변화, ROI 시각화

### DB 스키마 (Phase 2)

```
stores (id, owner_user_id, name, category, address, lat, lng, plan, created_at)
campaigns (id, store_id, title, description, benefit, max_bloggers, start_date, end_date, status)
matches (id, campaign_id, blogger_user_id, status[applied/selected/completed/reviewed], applied_at)
reviews (id, match_id, blog_url, has_ad_disclosure, quality_score, submitted_at)
```

### 기술 스택

- 프론트: 기존 Next.js 14 확장 (apps/web에 /store, /campaign 페이지 추가)
- 백엔드: 기존 FastAPI 확장 (가게/캠페인/매칭 API)
- DB: 기존 Supabase 확장
- 매칭: Python — haversine(거리) + 카테고리 일치도 + visitor_stats(영향력)
- 광고표시 검증: 블로그 크롤링 → 첫 문단에 "광고" "협찬" "체험단" 키워드 존재 확인

### 매칭 알고리즘

```
score = (거리 가중치 × 1/distance_km)
      + (카테고리 일치 × 3.0)
      + (블로거 영향력 × log10(day_visitor_count))
      + (과거 리뷰 품질 × avg_quality_score)
```

---

## 4. NOTIFY-KAKAO — 알림 채널

### 단계별 구현

| 시점 | 채널 | 대상 | 구현 |
|------|------|------|------|
| 지금 | 카카오 나에게 보내기 | 관리자 본인 | OAuth 토큰 + refresh 자동화 |
| 지금 | FCM 웹 푸시 | 사용자 | Next.js 서비스워커 + firebase-admin |
| 사업자 등록 후 | 솔라피 알림톡 | 사용자 | 8원/건, Python SDK |

### 솔라피 vs NHN Cloud

| 항목 | 솔라피 | NHN Cloud |
|------|--------|-----------|
| 알림톡 단가 | 8원/건 | 9원/건 |
| Python SDK | 공식 | 없음 (REST만) |
| 월 기본료 | 무료 | 무료 |

### 아키텍처

```python
# NotificationRouter — 채널별 분기
class NotificationRouter:
    async def send(self, user_id, message, level="info"):
        if level == "admin":
            await telegram.send(message)
            await kakao_memo.send(message)  # 나에게 보내기
        else:
            await fcm.send(user_id, message)  # 웹 푸시
            # 사업자 등록 후: await alimtalk.send(user_id, message)
```

---

## 실행 로드맵

```
즉시 가능 ──────────────────────────────────────→
│
├─ VISITOR-TRACK (1~2일)
│   └─ httpx + cron + Supabase + Chart.js
│
├─ MARKETING-01 (기획, 즉시 시작)
│   └─ 본인 블로그에 AI 명시 + 커뮤니티 홍보
│
사업자 등록 후 ──────────────────────────────────→
│
├─ NOTIFY-KAKAO (솔라피 알림톡)
│
블로거 20명+ 확보 후 ───────────────────────────→
│
└─ BIZ-MODEL (체험단 매칭)
```
