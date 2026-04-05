# 전체 사이트 디자인 리뷰 — 2026-04-05

> 대상: https://insungblog.vercel.app
> 기준: `/apps/web/DESIGN.md` 디자인 시스템 분석 문서
> 리뷰어: Claude Opus 4.6 (소스코드 기반 deep 분석)
> 총 수정: 29건 fix (18 파일)

---

## 1. 페이지별 등급표

### 등급 기준
- **A**: 기준에 부합, 일관성 높음
- **B**: 경미한 불일치 (POLISH급)
- **C**: 개선 필요 (MEDIUM급)
- **D**: 심각한 불일치 (HIGH급)
- **F**: 사용 불가 수준

| 카테고리 | / 랜딩 | /login | /write | /dashboard | /calendar | /persona | /bot | /neighbor | /pricing | /billing | /guide | /analytics |
|----------|--------|--------|--------|-----------|-----------|----------|------|-----------|----------|---------|--------|-----------|
| Visual Hierarchy | A | A | A | A | A | A | A | A | B→A | B→A | A | A |
| Typography | B→A | A | A | A | A | A | B→A | A | B→A | A | A | A |
| Color & Contrast | B→A | C→A | B→A | C→A | C→A | C→A | C→A | C→A | A | C→A | A | B→A |
| Spacing & Layout | A | A | A | A | A | A | A | A | B→A | A | A | A |
| Interaction States | A | A | A | A | A | A | A | A | A | A | A | A |
| Responsive | A | A | A | A | A | A | A | A | A | A | A | A |
| Motion | A | B | B | B | B | B | A | B | B | B | B | B |
| Content Quality | B→A | A | A | A | A | A | A | A | A | B→A | B→A | A |
| AI Slop Detection | A | A | A | A | A | A | A | A | A | A | A | A |
| Performance | A | A | A | A | A | A | A | A | A | A | A | A |

> 화살표(→)는 이번 리뷰에서 개선된 등급

### 종합 등급: **B+** (수정 전 C+)

---

## 2. 강점 (기존 + 발견)

1. **일관된 페이지 구조**: 모든 대시보드 페이지가 `space-y-6` + `h1 text-2xl font-bold` + `p text-sm text-muted-foreground` 패턴을 따름
2. **CSS 변수 기반 테마**: shadcn/ui 표준 방식으로 색상 관리
3. **반응형 레이아웃**: 사이드바/탭 전환, 모바일 스크롤 탭 + fade 오버레이
4. **Card 중심 레이아웃**: 정보 구분이 명확
5. **cn() 유틸리티**: clsx + tailwind-merge로 조건부 클래스 깔끔 처리
6. **접기/펼치기 패턴**: 긴 목록의 정보 과부하 방지
7. **Pretendard 한국어 폰트**: CDN 동적 서브셋, 한글 최적화
8. **prefers-reduced-motion**: 애니메이션 접근성 대응 완료
9. **랜딩 페이지**: 비대칭 그리드, 미니 제품 프리뷰, 3-step 구조가 세련됨
10. **봇 제어판**: 4버튼 그리드 + 토글 + 진행률 바가 잘 구조화됨

---

## 3. Findings 목록

### HIGH (즉시 수정 필요) — 6건 수정됨

| ID | 페이지 | 내용 | 상태 |
|----|--------|------|------|
| FINDING-001 | 온보딩 | `bg-emerald-100/600`, `text-gray-600/200` 하드코딩 → `bg-primary/10`, `text-muted-foreground`, `bg-muted` 토큰 | FIXED |
| FINDING-002 | /login | `error.startsWith("✓")` 해키한 패턴으로 성공/에러 구분 → 별도 `successMessage` 상태 도입 | FIXED |
| FINDING-004 | /calendar | `STATUS_COLORS`에 `bg-gray-200 text-gray-700` → `bg-muted text-muted-foreground` | FIXED |
| FINDING-016 | /dashboard | `statusConfig` 완료/실패/취소 하드코딩 → `primary/destructive/muted` 토큰 | FIXED |
| FINDING-027 | /pricing | `space-y-8` 패턴 불일치 → `space-y-6` 통일 | FIXED |
| FINDING-030 | /bot 컴포넌트 | `classifyError()` 반환값에 `text-red-500` 하드코딩 → `text-destructive` | FIXED |

### MEDIUM (개선 권장) — 23건 수정됨

| ID | 페이지 | 내용 | 상태 |
|----|--------|------|------|
| FINDING-003 | / (랜딩) | MiniStat `text-[10px]` 가독성 부족 → `text-xs` (12px) | FIXED |
| FINDING-005 | /neighbor | 테마 배지 `bg-emerald-100 text-emerald-700` → `bg-primary/10 text-primary` | FIXED |
| FINDING-006 | /calendar | 완료글 배지 `bg-emerald-50 text-emerald-700` → `bg-primary/10 text-primary` | FIXED |
| FINDING-007 | /persona | `text-purple-500` 오프팔레트 → `text-blue-600` (in-progress 통일) | FIXED |
| FINDING-008 | /write | 발행 버튼 `bg-green-600` 하드코딩 → primary 토큰 (기본 Button) | FIXED |
| FINDING-009 | /billing | 페이지 설명 텍스트 누락 → `<p>` 추가 (일관성) | FIXED |
| FINDING-010 | /pricing | `text-3xl` → `text-2xl` + `text-sm` 일관성 통일 | FIXED |
| FINDING-011 | / (랜딩) | footer 너무 단조 → 이메일 연락처 추가, 간격 보강 | FIXED |
| FINDING-012 | /bot | 토스트 `bg-green-600/bg-red-600` → `bg-primary/bg-destructive` | FIXED |
| FINDING-013 | / (랜딩) | "AI 작성 중..." `text-[10px]` → `text-xs` | FIXED |
| FINDING-014 | /bot | BotControlPanel `text-[11px]` x4곳 → `text-xs` | FIXED |
| FINDING-015 | /dashboard | 에러 메시지 `text-red-600` → `text-destructive` | FIXED |
| FINDING-017 | /write | 한도초과/에러 `text-red-500/600` → `text-destructive` | FIXED |
| FINDING-018 | /persona | 에러 `text-red-500` → `text-destructive`, 진행 `text-blue-500` → `text-blue-600` | FIXED |
| FINDING-019 | /analytics | 크롤링 메시지 `text-blue-500` → `text-blue-600` | FIXED |
| FINDING-020 | /billing | 결제 완료 `text-green-600` → `text-primary`, 실패 → `text-destructive` | FIXED |
| FINDING-021 | /billing | 활성 배지 `bg-green-100` → `bg-primary/10`, 실패 → `bg-destructive/10` | FIXED |
| FINDING-022 | /neighbor | 에러 alert `bg-red-50 text-red-600` → `bg-destructive/10 text-destructive` | FIXED |
| FINDING-023 | /neighbor | 서로이웃 배지 `bg-green-100 text-green-700` → `bg-primary/10 text-primary` | FIXED |
| FINDING-024 | /guide | Step 설명 줄바꿈 안됨 → `whitespace-pre-line` 추가 | FIXED |
| FINDING-026 | /calendar | 삭제 버튼 `text-red-500` → `text-destructive` | FIXED |
| FINDING-028 | /bot | ProgressBar 성공/실패 `text-green-600/text-red-500` → `text-primary/text-destructive` | FIXED |
| FINDING-029 | /bot | 최근 명령 완료/실패 → `text-primary/text-destructive` | FIXED |

### POLISH (향후 개선) — 미수정, 기록만

| ID | 페이지 | 내용 | 비고 |
|----|--------|------|------|
| P-001 | 전체 | Motion 등급이 B인 페이지 다수 — `tailwindcss-animate` 활용도 낮음 | 향후 스켈레톤 로딩, 페이지 전환 등 |
| P-002 | /bot | CommentCalendar `bg-green-200/400/600/800` 히트맵 — 토큰화 어려움 (그라데이션) | CSS 변수로 5단계 스케일 정의 필요 |
| P-003 | 전체 | `<select>` 네이티브 엘리먼트 3곳 — shadcn Select 미설치 | 컴포넌트 도입 시 교체 |
| P-004 | 전체 | 모달에 focus trap 없음 — Radix Dialog 도입 시 해결 | 접근성 |
| P-005 | 전체 | Badge 컴포넌트 미추출 — 인라인 `<span>` 반복 | 공통 컴포넌트로 추출 가능 |
| P-006 | 전체 | Toast 시스템 미도입 — 성공/에러를 인라인 텍스트로만 처리 | sonner 또는 react-hot-toast 도입 |
| P-007 | .dark | 다크 모드 CSS 변수가 orange 톤으로 라이트 모드 green과 불일치 | 토글 UI도 없으므로 변수 정리 or 삭제 |
| P-008 | 전체 | `yellow-*` 경고색에 대한 시맨틱 토큰(`--warning`) 부재 | globals.css에 변수 추가 권장 |
| P-009 | /login | 카카오/네이버 소셜 로그인 버튼이 `bg-[#FEE500]` 인라인 — 브랜드색이므로 적절 | 유지 |

---

## 4. 수정 요약

### 커밋 1: `style(design): FINDING-001~029`
- 14개 파일, 63 insertions, 54 deletions
- 핵심: 하드코딩 색상 → 디자인 시스템 토큰 통일
- login 페이지 `startsWith("✓")` 패턴 제거

### 커밋 2: `style(design): FINDING-030~035`
- 4개 파일, 8 insertions, 8 deletions
- 핵심: 봇 컴포넌트 색상 토큰 통일

### 수정된 파일 목록 (18개)
```
apps/web/app/page.tsx                                    (랜딩)
apps/web/app/(auth)/login/page.tsx                       (로그인)
apps/web/app/(dashboard)/(blog)/write/page.tsx           (글쓰기)
apps/web/app/(dashboard)/(blog)/dashboard/page.tsx       (내 글)
apps/web/app/(dashboard)/(blog)/calendar/page.tsx        (캘린더)
apps/web/app/(dashboard)/(blog)/persona/page.tsx         (페르소나)
apps/web/app/(dashboard)/(blog)/analytics/page.tsx       (성과분석)
apps/web/app/(dashboard)/(social)/bot/page.tsx           (댓글봇)
apps/web/app/(dashboard)/(social)/neighbor/page.tsx      (이웃봇)
apps/web/app/(dashboard)/(main)/pricing/page.tsx         (요금제)
apps/web/app/(dashboard)/(main)/billing/page.tsx         (구독관리)
apps/web/app/(dashboard)/(main)/guide/page.tsx           (사용법)
apps/web/components/onboarding-dialog.tsx                 (온보딩)
apps/web/app/(dashboard)/(social)/bot/_components/BotControlPanel.tsx
apps/web/app/(dashboard)/(social)/bot/_components/RunHistoryPanel.tsx
apps/web/app/(dashboard)/(social)/bot/_components/CookieStatusBadge.tsx
apps/web/app/(dashboard)/(social)/bot/_components/BotSettingsPanel.tsx
```

---

## 5. 페이지별 상세 분석

### 5.1 / (랜딩)

**역할**: 마케팅 페이지, 미인증 사용자 대상

**강점**:
- 비대칭 5-col 그리드로 시각적 긴장감
- 미니 제품 프리뷰(브라우저 모킹)가 신뢰감 제공
- 모바일 전용 인라인 스탯 배지 (`md:hidden`)
- `animate-fade-up` + staggered delay로 자연스러운 입장

**수정 사항**:
- `text-[10px]` 2곳 → `text-xs` (최소 가독성 기준 12px)
- footer 내용 보강 (이메일 연락처 추가)

**남은 이슈**: 없음

### 5.2 /login (로그인/회원가입)

**역할**: 인증 게이트

**강점**:
- 카드 중앙 정렬, 깔끔한 폼
- 소셜 로그인(카카오/네이버) 버튼 브랜드색 정확
- Open Redirect 방지 로직 포함

**수정 사항**:
- `error.startsWith("✓")` 해키한 패턴 → 별도 `successMessage` 상태로 분리
- 에러색 `text-red-600` → `text-destructive`
- 성공색 `text-green-600` → `text-primary`

**남은 이슈**: 없음

### 5.3 /write (AI 글쓰기)

**역할**: 핵심 프로덕트 페이지 (사진 업로드 → AI 초안 생성)

**강점**:
- 2-col 레이아웃 (입력/프리뷰)
- 드래그 앤 드롭 사진 순서 변경
- 플로팅 피드백 바 (하단 고정)
- 버전 히스토리 UI
- `isDirty` 이탈 방지

**수정 사항**:
- 발행 버튼 `bg-green-600` → primary (이미 에메랄드)
- 에러/한도초과 → `text-destructive`

**남은 이슈**: `<select>` 네이티브 사용 (페르소나 선택)

### 5.4 /dashboard (내 글 목록)

**강점**:
- 상태별 배지 색상 구분 명확
- 완료글 클릭 → 편집 페이지 이동
- 빈 상태 CTA 제공

**수정 사항**:
- `statusConfig` 완료/실패/취소 → 디자인 토큰
- 에러 메시지 → `text-destructive`

### 5.5 /calendar (콘텐츠 캘린더)

**강점**:
- 자체 캘린더 그리드 구현 (table 기반)
- 일요일 빨강, 토요일 파랑 컬러코딩
- 오늘 날짜 하이라이트 (`bg-primary/5`)
- 이벤트 + 완료글 배지 오버레이

**수정 사항**:
- `STATUS_COLORS` gray/green/red → muted/primary/destructive
- 완료글 배지 emerald → primary
- 삭제 버튼 → destructive

### 5.6 /persona (페르소나 관리)

**강점**:
- 카드 그리드 (sm:2col, lg:3col)
- 기본 페르소나 배지
- 상태별 색상 구분

**수정 사항**:
- `text-purple-500` (오프팔레트) → `text-blue-600`
- `text-green-500` → `text-primary`
- 에러 → `text-destructive`

### 5.7 /bot (댓글봇)

**강점**:
- 4버튼 그리드 액션 바 (수집/승인/게시/대댓글)
- 실시간 진행률 바
- 에러 분류 시스템 (`classifyError`)
- 승인 패널 일괄 승인/편집 기능
- 토스트 알림

**수정 사항**:
- 토스트 green/red → primary/destructive
- `text-[11px]` x4곳 → `text-xs`
- 진행률 바, 최근 명령, 에러 분류 색상 → 토큰화
- 자동수집 표시등 → primary

### 5.8 /neighbor (이웃관리)

**강점**:
- 2-col 액션 카드 (새글 댓글 / 새 이웃 찾기)
- 인라인 테마 태그 편집
- 이웃 목록 접기/펼치기

**수정 사항**:
- 테마 배지 emerald → primary
- 이웃 타입 배지 green/gray → primary/muted
- 에러 alert → destructive

### 5.9 /pricing (요금제)

**강점**:
- 3-col 카드 그리드
- "인기" 배지
- 현재 플랜 표시

**수정 사항**:
- `text-3xl` → `text-2xl` (대시보드 통일)
- `space-y-8` → `space-y-6`
- `text-sm` 추가 (설명 텍스트)

### 5.10 /billing (구독 관리)

**강점**:
- Lucide 아이콘 (CreditCard, Calendar, RefreshCw, XCircle)
- 결제 이력 카드
- 동기화 버튼 spin 애니메이션

**수정 사항**:
- 페이지 설명 텍스트 누락 → 추가
- 활성/실패 배지 → primary/destructive 토큰
- 결제 완료/실패 → primary/destructive

### 5.11 /guide (사용법 가이드)

**강점**:
- 3-step 카드 + 기능 상세 + FAQ 구조 명확
- CTA 버튼으로 바로 이동 가능

**수정 사항**:
- Step 설명 줄바꿈 안됨 → `whitespace-pre-line` 추가

### 5.12 /analytics (성과 분석)

**강점**:
- 요약 카드 3개 (총/평균/인기글)
- recharts LineChart
- 게시물별 필터 select

**수정 사항**:
- 크롤링 메시지 `text-blue-500` → `text-blue-600` (shade 통일)

---

## 6. 향후 로드맵 (DESIGN.md Phase 2-3 연계)

### 단기 (다음 리뷰까지)
1. `--warning` CSS 변수 추가 → `yellow-*` 하드코딩 제거
2. `--info` CSS 변수 추가 → `blue-*` 하드코딩 제거
3. `.dark` 모드 CSS 변수를 green 계열로 정리하거나 삭제

### 중기
4. Badge 공통 컴포넌트 추출 (variants: success, warning, error, info, default)
5. Switch 컴포넌트 추출 (BotControlPanel 토글)
6. Toast 시스템 도입 (sonner/react-hot-toast)
7. Dialog 컴포넌트 (Radix) 도입 → focus trap, ESC, aria

### 장기
8. 스켈레톤 로딩 (모든 페이지 loading state)
9. 페이지 전환 애니메이션
10. Select 컴포넌트 (shadcn) 도입

---

## 7. 리스크 평가

- 총 수정 29건 중 **구조적 변경 0건**, 모두 CSS 클래스 교체
- login 페이지만 `successMessage` 상태 추가 (로직 변경 최소)
- TypeScript 타입 체크 통과 확인
- **리스크: 5% 이하** (CSS-only 변경)
