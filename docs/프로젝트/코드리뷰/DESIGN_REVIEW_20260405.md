# 봇 페이지 디자인 리뷰

> 리뷰 일시: 2026-04-05
> 대상: `apps/web/app/(dashboard)/(social)/bot/` 전체
> 기준: DESIGN.md (2026-04-05) + globals.css

---

## 종합 등급

| 카테고리 | 등급 | 요약 |
|----------|------|------|
| 디자인 일관성 | **C+** | 토큰 체계 존재하나 시맨틱 색상 하드코딩 만연 |
| 컴포넌트 구조 | **B+** | 도메인별 분리 우수, hooks 패턴 양호, 일부 재사용성 미흡 |
| 접근성 | **D+** | role/aria 최소한만 존재, focus trap/label 연결 대부분 누락 |
| 반응형 | **B** | 모바일 기본 대응 완료, 캘린더/차트 영역 미흡 |
| UI/UX | **B** | 작업 흐름 명확, 에러 분류 좋음, 빈 상태/로딩 처리 존재 |
| AI Slop | **A-** | 이모지 사용 없음, 실용적 코드, 과도한 center 정렬 없음 |

---

## 1. 디자인 일관성 — C+

### 1.1 색상 토큰 vs 하드코딩

DESIGN.md에서 `--primary`, `--destructive` 등 CSS 변수 기반 색상 체계를 정의했으나, 봇 페이지에서는 **시맨틱 색상을 거의 모두 Tailwind 유틸리티로 하드코딩**한다.

**위반 사례 (파일별)**:

| 파일 | 하드코딩 | 토큰 대안 |
|------|---------|----------|
| BotControlPanel.tsx:34 | `text-green-600` (성공) | `text-primary` 또는 success 토큰 |
| BotControlPanel.tsx:35 | `text-red-500` (실패) | `text-destructive` |
| BotControlPanel.tsx:57 | `text-red-500` (에러 기본) | `text-destructive` |
| BotControlPanel.tsx:60-61 | `text-orange-600` (쿠키/로그인) | warning 토큰 미정의 |
| BotControlPanel.tsx:64-66 | `text-yellow-600` (셀렉터/타임아웃) | warning 토큰 미정의 |
| BotControlPanel.tsx:134 | `bg-green-500` (자동 수집 dot) | `bg-primary` 가능 |
| BotControlPanel.tsx:145-146 | `border-yellow-400 bg-yellow-50` | warning 토큰 미정의 |
| BotControlPanel.tsx:150 | `text-yellow-600` | warning 토큰 미정의 |
| BotControlPanel.tsx:157 | `bg-yellow-500` (배지) | warning 토큰 미정의 |
| BotControlPanel.tsx:171-172 | `border-blue-400 bg-blue-50` | info 토큰 미정의 |
| BotControlPanel.tsx:183 | `bg-blue-500` (배지) | info 토큰 미정의 |
| BotControlPanel.tsx:267 | `bg-blue-500` (진행 중 dot) | info 토큰 미정의 |
| BotControlPanel.tsx:301 | `text-green-600` (완료) | `text-primary` |
| BotControlPanel.tsx:303 | `text-red-500` (실패) | `text-destructive` |
| BotControlPanel.tsx:322 | `text-blue-600` (해결책) | info 토큰 미정의 |
| CookieStatusBadge.tsx:125 | `text-yellow-600` (미등록) | warning 토큰 |
| CookieStatusBadge.tsx:159 | `text-green-600` / `text-red-500` | success/destructive |
| CommentAnalyticsChart.tsx:170 | `hsl(142, 71%, 45%)` | `hsl(var(--primary))` |
| CommentAnalyticsChart.tsx:171 | `hsl(217, 91%, 60%)` | `hsl(var(--chart-2))` 또는 info |
| CommentAnalyticsChart.tsx:173 | `hsl(0, 84%, 60%)` | `hsl(var(--destructive))` |
| CommentCalendar.tsx:20-24 | `bg-green-200/400/600/800` | primary shade 또는 전용 변수 |
| RunHistoryPanel.tsx:56 | `text-red-500` (실패) | `text-destructive` |
| RunHistoryPanel.tsx:65 | `text-red-500` (오류) | `text-destructive` |
| page.tsx:151-158 | `border-amber-300 bg-amber-50 text-amber-*` | warning 토큰 |
| bot-api.ts:131-134 | `bg-blue-100 text-blue-700`, `bg-green-100 text-green-700` 등 | 시맨틱 토큰 |

**핵심 문제**: globals.css에 `success`, `warning`, `info` 시맨틱 토큰이 정의되어 있지 않아서, 개발자가 Tailwind 유틸리티를 직접 쓸 수밖에 없는 구조. DESIGN.md에서도 이 문제를 Phase 1 개선사항으로 지적.

### 1.2 배지 스타일 불일치

상태 배지가 bot-api.ts의 `STATUS_LABELS`로 부분 통합되었지만, BotControlPanel의 에러 분류(`classifyError`)에서는 별도 색상 체계를 사용. 같은 "실패"인데 `text-red-500`, `text-red-700`, `bg-red-100 text-red-700` 세 가지 변형이 혼재.

### 1.3 다크 모드

globals.css의 `.dark` 변수는 orange/warm 톤으로, 라이트 모드의 green 톤과 완전히 다른 색상 체계. CommentCalendar에서만 `dark:bg-green-*` 클래스를 사용하고, 나머지 파일은 다크 모드 대응 없음. **불일치가 명확**하지만 다크 모드 토글 자체가 없어서 실질적 영향은 낮음.

### 1.4 양호한 점

- 페이지 헤더 패턴 (`text-2xl font-bold` + `text-sm text-muted-foreground`) DESIGN.md 기준과 일치
- Card 컴포넌트 사용 일관적
- `text-muted-foreground` 보조 텍스트 토큰 활용 우수
- `bg-muted`, `bg-primary`, `border-border` 등 기본 토큰은 잘 사용

---

## 2. 컴포넌트 구조 — B+

### 2.1 장점

**도메인 분리가 잘 되어 있다.**

```
bot/
  page.tsx              -- 오케스트레이터 (상태 조합 + 레이아웃)
  _components/          -- 순수 프레젠테이션 컴포넌트 8개
  _hooks/               -- 상태 관리 훅 3개
  _lib/bot-api.ts       -- API 호출 + 타입 + 상수
```

- `_` 접두사 컨벤션으로 Next.js 라우팅에서 제외
- hooks가 비즈니스 로직을 담당하고, 컴포넌트는 UI에 집중
- bot-api.ts가 타입, 상수, API 호출, 유틸 함수를 한 곳에서 관리
- page.tsx가 "접착제" 역할만 수행 (상태 조합 + 콜백 전달)

**Props 인터페이스가 명시적이다.**

모든 컴포넌트가 Props 인터페이스를 export 없이 파일 내부에 정의. 타입 안전성 확보.

### 2.2 개선 필요

**토글 스위치 중복 구현** (BotControlPanel.tsx:211-243)

```tsx
<button role="switch" aria-checked={...}
  className="relative inline-flex h-6 w-11 ...">
  <span className="inline-block h-4 w-4 ..." />
</button>
```

이 패턴이 두 번 반복. DESIGN.md에서도 "Switch 컴포넌트 미분리"를 지적. `components/ui/switch.tsx`로 추출해야 한다.

**접기/펼치기 패턴 중복**

4개 컴포넌트(BotSettingsPanel, CommentHistoryTable, CookieStatusBadge, RunHistoryPanel)가 동일한 "CardHeader 클릭 -> ChevronDown 회전 -> 조건부 CardContent" 패턴을 반복. `CollapsibleCard` 또는 Radix `Collapsible` 도입이 바람직.

**classifyError가 BotControlPanel 내부에 있다**

에러 분류 로직은 비즈니스 로직이므로 `_lib/bot-api.ts`로 이동하는 것이 적절.

**DayData 타입 중복**

CommentCalendar.tsx와 CommentAnalyticsChart.tsx에서 동일한 `DayData` 인터페이스를 각각 정의. bot-api.ts로 통합 필요.

**CommentAnalyticsChart 내부 Legend/Tooltip formatter 중복**

LineChart와 BarChart에서 동일한 `formatter` 함수와 `labels` 맵이 복사-붙여넣기됨 (170줄 코드 중 ~40줄이 중복). 공통 변수로 추출 가능.

### 2.3 useBotStatus 비대화

`useBotStatus` 훅이 상태 16개 + 함수 12개를 반환하며, 폴링/타이머/visibilitychange 등 복잡한 side effect를 관리. 현재는 동작하지만, 기능 추가 시 분리가 필요할 수 있다:
- 명령 제어 로직 -> `useBotCommand` 분리
- 데이터 페칭 -> `useBotData` 분리

---

## 3. 접근성 — D+

### 3.1 양호한 점

- 커스텀 토글에 `role="switch"` + `aria-checked` 적용 (BotControlPanel.tsx:212-213)
- 외부 링크에 `rel="noopener noreferrer"` + `target="_blank"` (CommentApprovalPanel.tsx:145)
- `title` 속성으로 truncated 텍스트 전체 내용 제공 (BotControlPanel.tsx:319)

### 3.2 심각한 누락

**Focus Trap 없음**

재실행 경고 다이얼로그(BotControlPanel.tsx:248-261)가 인라인 div로 표시되며, focus trap/ESC 처리가 없다. 키보드 사용자가 배경 요소에 접근 가능.

**label-input 미연결**

BotSettingsPanel의 모든 `<label>` + `<Input>` 쌍에서 `htmlFor`/`id` 연결이 없다:
- "내 네이버 블로그 ID" (line 67-68)
- "모드" (line 90-91)
- "평일 시간대" (line 118)
- "주말 시간대" (line 151)
- "일일 블로거 한도" (line 186)
- "일일 댓글 한도" (line 203)
- "일일 신청 한도" (line 242)
- "신청 메시지" (line 260)
- "댓글 스타일 프롬프트" (line 284)

스크린리더 사용자가 입력 필드의 용도를 알 수 없다.

**색상만으로 상태 전달**

- CommentCalendar의 강도 표시: 녹색 농도로만 구분 (색맹 대응 없음)
- STATUS_LABELS의 배지: `bg-blue-100 text-blue-700` (승인), `bg-green-100 text-green-700` (게시완료) - 텍스트 라벨이 있어서 부분적으로 보완됨
- BotControlPanel의 진행 중 dot: `bg-blue-500` 단색 + `animate-pulse` - 시각적으로만 인지

**접기/펼치기 헤더에 키보드 접근성 부재**

4개의 접기/펼치기 Card가 `<CardHeader onClick={...}>` 패턴인데:
- `role="button"` 없음
- `tabIndex` 없음
- `aria-expanded` 없음
- `onKeyDown` (Enter/Space) 없음

마우스로만 조작 가능.

**액션 버튼 그리드의 버튼에 aria-label 없음**

BotControlPanel의 4개 액션 버튼이 `<button>` 태그이나, 비활성 상태의 이유를 스크린리더에 전달하지 않음. `aria-disabled`와 `aria-label`이 바람직.

### 3.3 네이티브 select 사용 (부분적 이점)

BotSettingsPanel의 `<select>`는 네이티브 요소라 기본 접근성이 확보됨. DESIGN.md에서 "shadcn Select로 교체"를 권장하지만, 접근성 측면에서는 네이티브가 오히려 나은 면도 있다.

---

## 4. 반응형 — B

### 4.1 양호한 점

**레이아웃 구조가 잘 되어 있다.**

- `SocialLayout`: `hidden md:block` 사이드바 + `md:hidden` 모바일 수평 탭 + fade 오버레이
- `CommentStatsCard`: `grid gap-4 sm:grid-cols-3` (모바일 1열 -> 데스크탑 3열)
- `BotControlPanel` 버튼 그리드: `grid grid-cols-2 sm:grid-cols-4` (모바일 2x2 -> 데스크탑 4열)
- `BotSettingsPanel` 설정 필드: `grid gap-4 sm:grid-cols-2`
- `CommentApprovalPanel` 버튼: `flex-col sm:flex-row` 모바일 세로 배치

### 4.2 개선 필요

**CommentCalendar 가로 스크롤 미처리**

캘린더가 `flex gap-1`로 주차별 열을 나열하는데, 28일(4주)이면 문제없지만 날짜가 늘어나면 overflow 처리가 없다. 셀 크기가 `h-4 w-4`(16px)로 고정이라 모바일에서 너무 작을 수 있다.

**CommentAnalyticsChart 높이 고정**

`height={200}`이 ResponsiveContainer에 하드코딩. 모바일에서 차트가 좁은 화면에 200px 높이로 표시되면 축 라벨이 겹칠 수 있다. `height` 반응형 처리 없음.

**CommentHistoryTable의 max-height**

`max-h-[400px] overflow-y-auto`가 모바일/데스크탑 동일. 모바일에서 400px는 화면의 대부분을 차지할 수 있다.

**BotSettingsPanel의 고정 너비**

- Input `className="w-64"` (256px) -- 좁은 모바일에서 잘릴 수 있음
- Input `className="w-20"` (80px) -- 시간 입력, 적절
- Input `className="w-32"` (128px) -- 한도 입력, 적절

### 4.3 온보딩 배너

page.tsx의 쿠키 미등록 배너가 반응형 대응이 되어 있다 (`flex items-start gap-3` + 아이콘 `shrink-0`).

---

## 5. UI/UX — B

### 5.1 장점

**작업 흐름이 명확하다.**

봇 실행(수집) -> 댓글 승인 -> 댓글 게시의 3단계가 BotControlPanel의 4버튼 그리드로 직관적으로 표현. 각 버튼의 상태(대기/실행 중/결과)가 시각적으로 구분됨.

**에러 분류 시스템이 사려 깊다.**

`classifyError` 함수가 에러 메시지를 분석해서 "쿠키 만료", "로그인 실패", "셀렉터 오류", "타임아웃"으로 분류하고, 각각에 대해 구체적 해결 방법(`remedy`)을 제시. 비기술 사용자도 조치 가능.

**재실행 방어가 있다.**

이미 대기 중인 댓글이 있을 때 봇을 다시 실행하면 경고 표시 (`showRunWarning`).

**온보딩 흐름이 자연스럽다.**

쿠키 미등록 -> 상단 배너 + 스크롤 링크 -> 쿠키 섹션 기본 열림 -> 업로드 후 자동 닫힘 + 15초 후 blog ID 자동 감지.

**빈 상태 처리가 일관적이다.**

모든 목록 컴포넌트에 빈 상태 메시지 존재:
- "대기 중인 댓글이 없습니다"
- "내역이 없습니다"
- "실행 이력이 없습니다"
- "데이터 없음" (차트)
- "활동 없음" (캘린더 hover)

**로딩 상태 처리도 일관적이다.**

page.tsx 최상위 + 각 서브 컴포넌트(차트, 캘린더, 히스토리) 개별 로딩.

### 5.2 개선 필요

**성공/에러 피드백이 인라인 텍스트에 의존**

쿠키 업로드 결과(CookieStatusBadge.tsx:156-163)가 `<span>` 텍스트로만 표시되고 자동으로 사라지지 않는다. 설정 저장 성공/실패도 피드백이 없다 (useBotSettings의 `settingsError`가 BotSettingsPanel에 전달되지 않음).

**승인 취소 버튼에 확인 다이얼로그 없음**

CommentApprovalPanel.tsx:246-249에서 "승인 취소" 클릭 시 즉시 API 호출. 실수 방지를 위한 확인 단계가 없다.

**접기 상태 영속성 없음**

4개 접기/펼치기 패널의 상태가 페이지 이동 시 초기화. 사용자가 "설정"을 펼쳐놓고 다른 페이지 갔다 오면 다시 접혀 있다. localStorage 또는 URL param으로 유지 가능.

**일괄 승인의 진행 표시 없음**

`handleBulkApprove`가 `Promise.allSettled`로 모든 댓글을 동시 승인하는데, 몇 개가 처리되었는지 진행률이 없다. 댓글이 많으면 사용자가 동작 여부를 알 수 없다.

**댓글 게시 버튼의 승인 개수 배지**

"댓글 게시" 버튼에 `approvedComments.length`가 표시되는데, 이것이 "게시할 댓글 수"인지 "승인 완료된 댓글 수"인지 헷갈릴 수 있다. "게시 대기 3건" 같은 명시적 라벨은 있지만, 배지 숫자만으로는 불명확.

**CommentApprovalPanel에서 거부 시 확인 없음**

승인 옆의 "거부" 버튼이 즉시 동작. 실수로 거부하면 되돌릴 방법이 UI에 없다.

---

## 6. AI Slop — A-

### 6.1 양호한 점

- **이모지 아이콘 사용 없음**: DESIGN.md에서 지적한 "봇 컨트롤 패널 이모지 아이콘" 문제가 **이미 수정됨**. 현재 Lucide 아이콘(Search, ClipboardCheck, CheckCircle2, Send, MessageSquareReply, Loader2)을 사용.
- **과도한 center 정렬 없음**: 실제 콘텐츠는 좌측 정렬, center는 로딩/빈 상태에서만 사용.
- **제네릭한 "환영합니다" 패턴 없음**: 온보딩 배너가 구체적 행동(쿠키 업로드)을 안내.
- **gradient 남용 없음**: 배경은 깔끔한 단색/카드 패턴.
- **불필요한 shadow 스택 없음**: Card 기본 shadow만 사용.
- **과도한 rounded 없음**: `rounded-xl`(버튼), `rounded-lg`(카드 내부), `rounded-full`(배지/dot)이 용도에 맞게 구분.

### 6.2 경미한 지적

- `&ldquo;...&rdquo;` (유니코드 따옴표)가 댓글 텍스트를 감싸는데, 한국어 맥락에서는 일반 따옴표가 더 자연스러울 수 있음. 다만 이것은 스타일 선호 문제.
- CommentAnalyticsChart의 7/14/30일 기간 선택 + 막대/선 차트 전환이 동시에 있는 건 기능적이지만, 사용 빈도 대비 복잡도를 높일 수 있다. 실제 사용 데이터 기반 판단 필요.

---

## 파일별 핵심 findings 요약

| 파일 | 주요 이슈 | 심각도 |
|------|----------|--------|
| `page.tsx` | 온보딩 배너 amber 하드코딩; `document.getElementById` 스크롤 | 낮음 |
| `BotControlPanel.tsx` | 토글 스위치 2회 중복; 색상 하드코딩 17건; classifyError 위치 부적절 | 중간 |
| `BotSettingsPanel.tsx` | label-input 미연결 9건; `w-64` 고정 너비; 에러 메시지 미표시 | 중간 |
| `CommentApprovalPanel.tsx` | 거부/승인취소 확인 없음; 일괄 승인 진행률 없음 | 중간 |
| `CommentHistoryTable.tsx` | 비교적 양호; STATUS_LABELS 잘 활용 | 낮음 |
| `CommentStatsCard.tsx` | 양호; 반응형 그리드 적절 | 없음 |
| `CommentCalendar.tsx` | DayData 중복 정의; green 하드코딩; 모바일 셀 크기 | 낮음 |
| `CommentAnalyticsChart.tsx` | DayData 중복; chart 변수 미사용; formatter 중복; 높이 고정 | 중간 |
| `CookieStatusBadge.tsx` | 피드백 자동 소멸 없음; 전반적으로 양호 | 낮음 |
| `RunHistoryPanel.tsx` | 양호; 접기 패턴 중복만 해당 | 낮음 |
| `_hooks/useBotStatus.ts` | 비대한 반환값 (28개); 분리 여지 있음 | 낮음 |
| `_hooks/useBotSettings.ts` | settingsError가 UI에 전달 안 됨 | 중간 |
| `_hooks/useCommentHistory.ts` | 양호 | 없음 |
| `_lib/bot-api.ts` | STATUS_LABELS 색상 하드코딩; 타입/API 통합 관리는 좋음 | 낮음 |

---

## 우선순위별 개선 권장

### P1 (즉시 — 접근성 기본)

1. BotSettingsPanel의 모든 label-input 쌍에 `htmlFor`/`id` 연결
2. 접기/펼치기 CardHeader에 `role="button"` + `tabIndex={0}` + `aria-expanded` + `onKeyDown` 추가
3. 재실행 경고 영역에 `role="alertdialog"` + 포커스 이동

### P2 (단기 — 재사용성)

4. 토글 스위치를 `components/ui/switch.tsx`로 추출
5. 접기/펼치기 Card를 `CollapsibleCard` 컴포넌트로 추출
6. `DayData` 타입을 bot-api.ts로 통합
7. `classifyError`를 bot-api.ts로 이동

### P3 (중기 — 디자인 일관성)

8. globals.css에 `--success`, `--warning`, `--info` 시맨틱 토큰 추가
9. 봇 페이지 전체의 하드코딩 색상을 토큰으로 교체
10. chart 색상을 `hsl(var(--chart-*))` 또는 시맨틱 토큰으로 교체
11. Badge 컴포넌트 도입으로 STATUS_LABELS 스타일 통합

### P4 (장기 — UX 개선)

12. Toast 시스템 도입 (쿠키 업로드/설정 저장 피드백)
13. 거부/승인취소에 확인 다이얼로그 추가
14. useBotStatus 훅 분리 (command/data/polling)
15. 접기 상태 localStorage 영속화
