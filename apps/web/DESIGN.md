# 디자인 시스템 분석 — 인성이 웹 앱

> 분석일: 2026-04-05
> 프레임워크: Next.js 14 + Tailwind CSS 3.4 + shadcn/ui (부분 설치)
> 경로: `apps/web/`

---

## 1. 색상 팔레트

### 1.1 CSS 변수 기반 색상 (globals.css)

라이트 모드에서 **에메랄드/그린 계열**을 주색으로 설정하여 "자연스러운 블로그" 느낌을 준다.

| 토큰 | HSL 값 (라이트) | 대략적 색상 | 용도 |
|------|-----------------|-------------|------|
| `--primary` | `142 71% 45%` | 에메랄드 그린 | CTA 버튼, 활성 탭, 링, 진행 바 |
| `--primary-foreground` | `0 0% 100%` | 순백 | primary 위 텍스트 |
| `--secondary` | `140 49% 96%` | 연한 민트 | 보조 배지, 카테고리 태그 |
| `--accent` | `142 49% 94%` | 연한 민트 | hover 배경 |
| `--destructive` | `0 84.2% 60.2%` | 빨강 | 삭제, 실패, 에러 |
| `--muted` | `140 20% 96%` | 연한 그레이 민트 | 비활성 배경 |
| `--muted-foreground` | `215 16% 47%` | 중간 그레이 | 보조 텍스트 |
| `--background` | `0 0% 100%` | 흰색 | 페이지 배경 |
| `--foreground` | `147 76% 10%` | 매우 어두운 그린 | 기본 텍스트 |
| `--border` | `142 20% 90%` | 연한 그린 그레이 | 테두리 |
| `--ring` | `142 71% 45%` | primary와 동일 | 포커스 링 |

### 1.2 다크 모드

다크 모드 변수가 정의되어 있지만, **실제로 다크 모드 토글 UI가 없다.** `.dark` 클래스 CSS 변수는 orange/warm 톤(shadcn 기본값)으로 라이트 모드의 그린 톤과 전혀 다른 색상 체계를 갖고 있어 **불일치** 상태다.

### 1.3 차트 색상

| 토큰 | 라이트 HSL | 용도 |
|------|-----------|------|
| `--chart-1` | `12 76% 61%` | 오렌지 계열 |
| `--chart-2` | `173 58% 39%` | 틸/시안 |
| `--chart-3` | `197 37% 24%` | 다크 블루 |
| `--chart-4` | `43 74% 66%` | 골드 |
| `--chart-5` | `27 87% 67%` | 코랄 |

그러나 실제 recharts 차트에서는 `chart-*` 변수를 사용하지 않고 **하드코딩된 HSL 값**을 사용한다:
- 댓글: `hsl(142, 71%, 45%)` (primary와 동일)
- 방문: `hsl(217, 91%, 60%)` (파란색)
- 실패: `hsl(0, 84%, 60%)` (빨간색)

### 1.4 시맨틱 색상 (하드코딩)

페이지 전반에 Tailwind 유틸리티로 **직접 하드코딩된 시맨틱 색상**이 다수 존재한다:

| 용도 | 사용된 클래스 | 비고 |
|------|-------------|------|
| 성공/활성 | `text-green-600`, `bg-green-100`, `bg-green-500/10` | primary 토큰 미사용 |
| 경고/대기 | `text-yellow-800`, `bg-yellow-50`, `border-yellow-300` | 토큰 없음 |
| 에러/실패 | `text-red-500`, `text-red-600`, `bg-red-100` | destructive 토큰 미사용 |
| 정보/진행 | `text-blue-500`, `bg-blue-100`, `bg-blue-50` | 토큰 없음 |
| 브랜드(에메랄드) | `text-emerald-600`, `bg-emerald-100` | primary 토큰 대신 직접 사용 |
| 카카오 | `#FEE500` (inline style) | 카카오 브랜드색 |
| 네이버 | `#03C75A` (inline style) | 네이버 브랜드색 |

---

## 2. 타이포그래피

### 2.1 폰트

- **Geist Sans** (`--font-geist-sans`): 가변 폰트, weight 100-900
- **Geist Mono** (`--font-geist-mono`): 가변 폰트, 코드/숫자 표시용
- `antialiased` 적용됨
- `lang="ko"` 설정 완료

### 2.2 텍스트 사이즈 스케일 (실제 사용 패턴)

| 용도 | 클래스 | 실제 사이즈 |
|------|--------|-------------|
| 페이지 제목 (h1) | `text-2xl font-bold` | 1.5rem (24px) |
| 랜딩 히어로 | `text-3xl sm:text-4xl md:text-5xl font-bold` | 반응형 30-48px |
| 섹션 제목 (h2) | `text-lg font-semibold` 또는 `text-2xl font-bold` | 혼재 |
| 카드 제목 | `text-base font-semibold` 또는 `text-base` | 16px |
| 본문 | `text-sm` | 14px |
| 보조 텍스트 | `text-sm text-muted-foreground` | 14px |
| 라벨 | `text-sm font-medium` | 14px |
| 캡션/메타 | `text-xs` | 12px |
| 극소 | `text-[10px]`, `text-[11px]` | 10-11px (임의 사이즈) |

### 2.3 가중치 (font-weight)

| 클래스 | 용도 |
|--------|------|
| `font-bold` | 페이지 제목, 중요 숫자 |
| `font-semibold` | 카드 제목, 섹션 제목, 네비 활성 |
| `font-medium` | 라벨, 배지, 네비 항목 |
| (기본) | 본문 텍스트 |

---

## 3. 간격 시스템

### 3.1 레이아웃 간격

| 패턴 | 클래스 | 값 |
|------|--------|-----|
| 최대 너비 | `max-w-6xl` (대시보드), `max-w-5xl` (콘텐츠), `max-w-4xl` (CTA) | 1152 / 1024 / 896px |
| 페이지 패딩 | `px-4 py-6` (대시보드), `px-6` (랜딩) | 16-24px |
| 섹션 간격 | `space-y-6` (대부분), `space-y-10` (가이드) | 24-40px |
| 카드 내부 패딩 | `p-6` (기본 Card) | 24px |
| 컴포넌트 간격 | `gap-4` (그리드), `gap-2` (버튼 그룹) | 16 / 8px |

### 3.2 일관성 평가

- 페이지 간 `space-y-6`이 **통일되어 있어** 좋다.
- `max-w-5xl`과 `max-w-6xl`이 혼재되지만 레이아웃 계층으로 구분되어 합리적이다.
- 카드 내부 간격은 `p-6 pt-0` 패턴으로 일관성이 있다.

---

## 4. 컴포넌트 패턴

### 4.1 shadcn/ui 설치 현황

| 컴포넌트 | 설치 여부 | 비고 |
|----------|----------|------|
| Button | O | 6 variants (default, destructive, outline, secondary, ghost, link) + 4 sizes |
| Card | O | Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter |
| Input | O | 기본 텍스트 입력 |
| Textarea | O | 기본 텍스트영역 |
| ConfirmDialog | O (커스텀) | Radix Dialog 미설치로 자체 구현 (overlay + Card) |
| Dialog | X | 미설치 — ConfirmDialog, 모달 등에서 직접 구현 |
| Select | X | 네이티브 `<select>` 사용 |
| Toggle/Switch | X | 커스텀 toggle 버튼 직접 구현 |
| Dropdown | X | 커스텀 드롭다운 직접 구현 (Header) |
| Toast/Notification | X | 에러/성공 메시지는 인라인 텍스트로 처리 |
| Tabs | X | 커스텀 탭 UI 직접 구현 |
| Badge | X | 인라인 `<span>` + Tailwind 클래스 |

### 4.2 공통 UI 패턴

**페이지 헤더 패턴** (모든 대시보드 페이지에서 일관적):
```
<div>
  <h1 className="text-2xl font-bold">제목</h1>
  <p className="text-sm text-muted-foreground">설명</p>
</div>
```

**로딩 패턴** (일관적):
```
<div className="flex items-center justify-center py-20">
  <p className="text-muted-foreground">로딩 중...</p>
</div>
```

**에러 메시지 패턴** (불일치):
- `text-red-500` 또는 `text-red-600` (혼재)
- 성공 메시지는 `text-green-600` 또는 `text-blue-500`
- 조건부 스타일: `error.startsWith("✓") ? "text-green-600" : "text-red-600"` (해키한 패턴)

**상태 배지 패턴** (불일치):
- `rounded-full px-2.5 py-0.5 text-xs font-medium` + 색상 조합
- `rounded-full px-2 py-0.5 text-xs font-medium` + 색상 조합
- `rounded px-2 py-0.5 text-xs font-medium` + 색상 조합
- 패딩, border-radius 미세 차이가 존재

**모달 패턴** (Radix 미사용):
```
<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
  <Card className="w-full max-w-md mx-4">...</Card>
</div>
```
일관적이나, 접근성 (focus trap, aria) 부재.

**토글 스위치 패턴** (커스텀):
```
<button role="switch" aria-checked={...}
  className="relative inline-flex h-5 w-9 items-center rounded-full">
  <span className="inline-block h-3.5 w-3.5 rounded-full bg-white shadow" />
</button>
```
기능적이지만 재사용 컴포넌트로 분리되어 있지 않다.

### 4.3 레이아웃 구조

```
RootLayout (lang="ko", Geist 폰트)
  +-- LandingPage (/) — 독립 레이아웃
  +-- Auth (login, reset-password) — 독립 레이아웃 (gradient 배경)
  +-- DashboardLayout
      +-- Header (border-b, max-w-6xl)
      +-- OnboardingDialog
      +-- BlogLayout (사이드바 + 콘텐츠)
      |     +-- /write, /calendar, /dashboard, /persona, /analytics
      +-- SocialLayout (사이드바 + 콘텐츠)
      |     +-- /bot, /neighbor
      +-- MainLayout (단순 max-w-5xl 래퍼)
            +-- /guide, /admin
```

**네비게이션 구조**:
- **Header**: 상단 고정, 드롭다운 2개 (글쓰기, 소셜봇) + 일반 링크 (사용법, 관리)
- **Sidebar** (Blog/Social): 데스크탑은 좌측 사이드바, 모바일은 수평 탭
- 사이드바와 Header 드롭다운이 동일 메뉴를 **중복** 제공 (의도적 — 접근 편의)

---

## 5. 반응형 디자인

### 5.1 브레이크포인트 (Tailwind 기본값)

| 프리픽스 | 최소 너비 | 사용 위치 |
|----------|----------|-----------|
| `sm:` | 640px | 그리드 2열, 버튼 크기 조정 |
| `md:` | 768px | 사이드바 표시/숨김, 그리드 전환, 텍스트 사이즈 |
| `lg:` | 1024px | 페르소나 3열 그리드 |
| `xl:` 이상 | — | 미사용 |

### 5.2 반응형 패턴

- **사이드바**: `hidden md:block` + 모바일 수평 탭 `md:hidden`
- **그리드**: `grid-cols-1 sm:grid-cols-2 md:grid-cols-3` 등
- **텍스트**: 랜딩 히어로만 반응형 사이즈, 대시보드 내 텍스트는 고정
- **유저 이메일**: `hidden sm:inline`
- **모바일 탭 스크롤**: `overflow-x-auto` + fade 오버레이 (좋은 패턴)
- **viewportFit**: `cover` 설정 (노치/홈 인디케이터 대응)

---

## 6. 아이콘 시스템

- **Lucide React** (`lucide-react@^0.577.0`)
- 사이드바에서 `h-4 w-4` 아이콘 사용
- 봇 컨트롤 패널에서는 **이모지**를 아이콘 대신 사용 (예: "🔍", "📋", "📤", "💬")
- 아이콘과 이모지가 혼재되어 시각적 일관성이 떨어짐

---

## 7. 애니메이션 & 트랜지션

| 패턴 | 클래스 | 위치 |
|------|--------|------|
| 색상 전환 | `transition-colors` | 버튼, 링크 hover |
| 그림자 전환 | `transition-shadow` | 카드 hover |
| 전체 전환 | `transition-all` | 사이드바 항목, 봇 버튼 |
| 드롭다운 애니메이션 | `scale-y-0 → scale-y-100 + opacity` | Header 드롭다운 |
| 진행 바 | `transition-all` (width 변화) | BotControlPanel |
| 맥박 효과 | `animate-pulse` | 실행 중 인디케이터 |

`tailwindcss-animate` 플러그인이 설치되어 있지만, 커스텀 애니메이션은 거의 활용하지 않는다.

---

## 8. 강점

1. **일관된 페이지 구조**: 모든 대시보드 페이지가 `space-y-6` + `h1 text-2xl font-bold` + `p text-sm text-muted-foreground` 패턴을 따른다.
2. **CSS 변수 기반 테마**: shadcn/ui 표준 방식으로 색상을 관리하여 향후 테마 확장이 용이하다.
3. **반응형 레이아웃**: 사이드바/탭 전환, 모바일 스크롤 탭 + fade 오버레이 등 모바일 UX가 잘 되어 있다.
4. **컴포넌트 추출**: BotControlPanel, CommentStatsCard 등 도메인 컴포넌트가 잘 분리되어 있다.
5. **Korean-first UX**: `lang="ko"`, Geist 폰트의 한글 fallback, 모든 UI 텍스트 한국어화 완료.
6. **Card 중심 레이아웃**: shadcn Card를 일관적으로 사용하여 정보 구분이 명확하다.
7. **cn() 유틸리티**: `clsx` + `tailwind-merge` 조합으로 조건부 클래스를 깔끔하게 처리한다.
8. **접기/펼치기 패턴**: 긴 목록을 접을 수 있게 하여 정보 과부하를 방지한다.

---

## 9. 약점

### 9.1 색상 일관성 (높은 우선순위)

- **시맨틱 색상이 토큰화되지 않음**: `text-green-600`, `text-red-500`, `text-blue-500` 등이 파일마다 다른 shade로 하드코딩.
  - 같은 "성공" 의미에 `text-green-500`, `text-green-600`, `bg-green-100`, `bg-green-500/10`이 혼재
  - 같은 "에러" 의미에 `text-red-500`, `text-red-600`이 혼재
- **emerald vs primary 이중 사용**: 랜딩, 온보딩에서 `emerald-600/700`을 직접 쓰고, 대시보드에서는 `primary`(= emerald) 토큰을 사용. 동일 색인데 참조 방식이 다르다.
- **다크 모드 미완성**: CSS 변수는 있지만 라이트/다크 색상 체계가 맞지 않고, 토글 UI도 없다.

### 9.2 컴포넌트 부재 (중간 우선순위)

- **Badge 컴포넌트 없음**: 상태 배지가 인라인 `<span>`으로 각 파일에서 다른 스타일로 작성됨.
- **Switch 컴포넌트 없음**: BotControlPanel에서 커스텀 토글을 매번 인라인으로 구현.
- **Toast/Notification 없음**: 성공/에러 메시지를 인라인 `<p>` 텍스트로만 표시 — 자동 사라지지 않음.
- **Select 컴포넌트 없음**: 네이티브 `<select>`가 디자인 시스템과 다른 외관.
- **Dialog 컴포넌트 없음**: 모달마다 overlay + Card를 직접 구현 — focus trap, ESC 처리가 불완전.

### 9.3 접근성 (중간 우선순위)

- 모달에 **focus trap** 없음 (ConfirmDialog만 ESC 처리 있음)
- 커스텀 드롭다운에 `role`, `aria-expanded` 등 ARIA 속성 부재
- 상태 배지에 **색상만으로 의미 전달** — 색맹 사용자 배려 부족
- label 요소에 `htmlFor` 미연결 (login 페이지 등)

### 9.4 코드 패턴 (낮은 우선순위)

- **"✓" 접두사로 성공/에러 구분**: `error.startsWith("✓")` 패턴은 fragile. 별도 상태 변수가 바람직.
- **상태 색상 매핑 테이블이 파일마다 중복 정의**: `STATUS_COLORS` (calendar), `statusConfig` (dashboard) 등.
- **인라인 스타일**: 카카오/네이버 로그인 버튼에 `style={{ backgroundColor: "..." }}` 사용.
- **이모지 아이콘**: 봇 컨트롤 패널에서 이모지를 아이콘 대신 사용 — Lucide와 불일치.

---

## 10. 개선 권장사항

### Phase 1: 토큰 정비 (즉시 가능)

1. **시맨틱 색상 CSS 변수 추가**:
   ```css
   :root {
     --success: 142 71% 45%;        /* green */
     --success-foreground: 0 0% 100%;
     --warning: 38 92% 50%;          /* amber */
     --warning-foreground: 0 0% 0%;
     --info: 217 91% 60%;            /* blue */
     --info-foreground: 0 0% 100%;
   }
   ```
   → tailwind.config에 `success`, `warning`, `info` 색상 추가
   → 하드코딩된 `green-*`, `yellow-*`, `blue-*` 클래스를 토큰으로 교체

2. **emerald → primary 통일**: 랜딩, 온보딩에서 `emerald-600`을 `primary`로 교체

3. **다크 모드 변수 수정 또는 삭제**: 현재 orange 톤의 다크 변수를 green 계열로 재설계하거나, 사용하지 않는다면 제거

### Phase 2: 공통 컴포넌트 추출 (중기)

4. **Badge 컴포넌트**: `variants: { success, warning, error, info, default }` + `size: { sm, default }`
5. **Switch 컴포넌트**: BotControlPanel의 커스텀 토글을 재사용 가능한 컴포넌트로 추출
6. **StatusBadge 매핑 통합**: 각 페이지에 흩어진 `STATUS_COLORS`, `statusConfig`를 `lib/constants.ts`로 통합
7. **Toast 시스템**: 성공/에러 알림을 자동 사라지는 Toast로 교체 (sonner 또는 react-hot-toast)

### Phase 3: 접근성 & 품질 (장기)

8. **Dialog 컴포넌트 도입**: Radix Dialog 설치 → focus trap, ESC, aria 자동 처리
9. **Select 컴포넌트 도입**: 네이티브 `<select>` → shadcn Select로 교체
10. **Label 연결**: `<label htmlFor="...">` + `<input id="...">` 패턴 적용
11. **색맹 대응**: 상태 배지에 아이콘 또는 텍스트 라벨 보완

---

## 부록: 파일 참조 목록

| 파일 | 역할 |
|------|------|
| `app/globals.css` | CSS 변수 정의 (라이트/다크) |
| `tailwind.config.ts` | Tailwind 확장 설정 |
| `lib/utils.ts` | `cn()` 유틸리티 |
| `components/ui/button.tsx` | Button (CVA 6 variants) |
| `components/ui/card.tsx` | Card 계열 6개 서브 컴포넌트 |
| `components/ui/input.tsx` | Input |
| `components/ui/textarea.tsx` | Textarea |
| `components/ui/confirm-dialog.tsx` | 커스텀 확인 다이얼로그 |
| `components/nav/header.tsx` | 글로벌 헤더 + 드롭다운 네비 |
| `components/onboarding-dialog.tsx` | 신규 유저 온보딩 오버레이 |
| `app/(dashboard)/(blog)/layout.tsx` | 블로그 섹션 사이드바 |
| `app/(dashboard)/(social)/layout.tsx` | 소셜봇 섹션 사이드바 |
| `app/(dashboard)/(main)/layout.tsx` | 일반 섹션 래퍼 |
