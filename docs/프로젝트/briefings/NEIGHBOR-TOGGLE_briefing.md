# NEIGHBOR-TOGGLE 브리핑

## 요약
이웃 페이지(/neighbor) 현황 탭의 이웃 목록에 접기/펼치기 토글 버튼 추가. localStorage로 상태 유지.

## 변경 파일
- `apps/web/app/(dashboard)/(social)/neighbor/page.tsx` — 토글 상태 관리 + 접기/펼치기 UI

## 기술 결정
- `<button>` 요소로 헤더 전체를 클릭 가능하게 구현 (접근성 우수)
- localStorage 키 `neighbor-list-visible`로 상태 영속화
- ▼ 화살표에 CSS transition으로 회전 애니메이션 적용
- 대안: shadcn Collapsible 사용 → 불필요한 의존성 추가 방지를 위해 직접 구현

## 테스트 결과
- TypeScript 타입 안전성 유지
- useEffect로 SSR hydration 불일치 방지 (클라이언트에서만 localStorage 읽기)

## 남은 작업 / 주의사항
- 없음

## 핵심 코드 변경
```tsx
// before: 고정 헤더
<div className="border-b px-4 py-3">
  <h3>이웃 목록 ({neighbors.length}명)</h3>
</div>
{/* 항상 보이는 목록 */}

// after: 클릭 가능한 토글 헤더
<button onClick={toggleListVisible} className="flex w-full ...">
  <h3>이웃 목록 ({neighbors.length}명)</h3>
  <span className={`... ${listVisible ? "rotate-180" : ""}`}>▼</span>
</button>
{listVisible && (/* 조건부 렌더링 */)}
```
