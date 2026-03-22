# NAV-LAYOUT 브리핑

## 요약
네비게이션 "글쓰기" 항목을 드롭다운 메뉴로 변경. 글쓰기/캘린더가 드롭다운 최상단에 위치하며, CSS scale-y 애니메이션으로 위에서 아래로 열리는 UX 구현.

## 변경 파일
- `apps/web/components/nav/header.tsx` — 글쓰기 드롭다운 메뉴 + 슬라이드다운 애니메이션

## 기술 결정
- **드롭다운 하위 항목**: 글쓰기(/write) → 캘린더(/calendar) → 내 글(/dashboard) → 페르소나(/persona) → 성과분석(/analytics)
- **애니메이션**: CSS `transform: scaleY()` + `origin-top` + `transition duration-200` (위에서 아래로 열리는 느낌)
- **외부 클릭 닫기**: `mousedown` 이벤트 + ref 기반 감지
- **대안**: shadcn DropdownMenu → 불필요한 Radix 의존성 추가 방지를 위해 직접 구현

## 테스트 결과
- TypeScript 타입 안전성 유지 (User, pathname 등)
- 기존 경로 매칭 로직 유지 (blogPaths, socialPaths)

## 남은 작업 / 주의사항
- 모바일 반응형 검증 필요 (현재 데스크톱 기준)

## 핵심 코드 변경
```tsx
// before: 단순 Link
<Link href="/calendar">글쓰기</Link>

// after: 드롭다운 + 슬라이드 다운
<button onClick={() => setDropdownOpen(!prev)}>
  글쓰기 ▼
</button>
<div className="origin-top transition-all duration-200 scale-y-{0|100}">
  <Link href="/write">글쓰기</Link>   // 상단
  <Link href="/calendar">캘린더</Link> // 상단
  <Link href="/dashboard">내 글</Link>
  ...
</div>
```
