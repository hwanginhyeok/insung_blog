# ADMIN-BOT-STATS 브리핑

## 요약
관리자 페이지에 유저별 댓글봇 사용현황 추가. API 엔드포인트 신규 생성 + admin/stats API 확장 + 사용자 테이블에 봇 상태 뱃지·통계 열 추가.

## 변경 파일
- `apps/web/app/api/admin/users/[userId]/bot-stats/route.ts` — **신규** 개별 유저 봇 상세 통계 API
- `apps/web/app/api/admin/stats/route.ts` — 전체 유저 봇 상태 요약(userBotStats) 추가
- `apps/web/app/(dashboard)/(main)/admin/page.tsx` — 사용자 테이블에 "봇" 열 추가 (상태 뱃지 + 실행횟수·댓글수)

## 기술 결정
- **2계층 API**: 목록에서는 `/admin/stats`의 `userBotStats`로 요약 표시, 상세 모달에서는 `/admin/users/[id]/bot-stats`로 세부 조회
- **상태 판정**: 최근 7일 내 실행 + 에러 없음 → active, 에러 → error, 실행 없음 → inactive
- **테이블 UI**: 뱃지(활성/에러/비활성) + "N회 · N건" 한줄 요약

## 테스트 결과
- TypeScript 타입 안전성 유지

## 남은 작업 / 주의사항
- UserDetailModal에 봇 실행 이력 탭 추가 (향후)

## 핵심 코드 변경
```tsx
// admin 테이블에 봇 상태 열 추가
<td>
  <span className="bg-green-500/10 text-green-600">활성</span>
  <span>3회 · 15건</span>
</td>
```
