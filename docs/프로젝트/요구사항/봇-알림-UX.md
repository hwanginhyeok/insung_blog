# 봇 알림 UX 요구사항

> 작성일: 2026-04-06
> 상태: 구현 완료

---

## 1. 요구사항

사용자가 봇 페이지를 열어놓고 다른 작업을 하거나 탭을 바꿔놓을 때,
댓글 게시 완료/실패 등 상태 변화를 **시각+청각으로 즉시 알려야 함**.

---

## 2. 구현 사양

### 2.1 인라인 토스트 팝업

| 항목 | 사양 |
|------|------|
| 위치 | 화면 우하단 (fixed bottom-6 right-6) |
| 지속 시간 | 4초 후 자동 해제 |
| 성공 색상 | bg-primary (에메랄드 그린) |
| 실패 색상 | bg-destructive (빨강) |
| 애니메이션 | toast-in (오른쪽에서 슬라이드) |
| 메시지 포맷 | "✅ {명령 라벨} 완료!" / "❌ {명령 라벨} 실패" |

### 2.2 알림음 (Web Audio API)

| 항목 | 사양 |
|------|------|
| 성공 | 880Hz 0.15초 → 200ms 후 1100Hz 0.15초 (짧은 두 번 비프) |
| 실패 | 440Hz 0.3초 (낮은 단일 비프) |
| 볼륨 | gain 0.3 (30%) |
| AudioContext | 싱글톤 패턴 (브라우저 인스턴스 제한 6-8개 회피) |
| suspended 대응 | 자동 resume() 호출 (브라우저 자동재생 정책) |

### 2.3 브라우저 Notification (OS 레벨)

| 항목 | 사양 |
|------|------|
| 발동 조건 | 탭이 비활성(hidden)일 때만 |
| 제목 | "인성이 봇" |
| 본문 | 토스트와 동일한 메시지 |
| 권한 | 최초 방문 시 permission 요청 (default → granted) |
| granted가 아닐 때 | 토스트만 표시 (Notification 생략) |

### 2.4 알림 트리거 조건

| 조건 | 알림 |
|------|------|
| 명령 running → completed | 성공 알림 |
| 명령 running → failed | 실패 알림 |
| 첫 페이지 로드 | 알림 안 띄움 (이전 완료 건 무시) |
| 동일 명령 중복 | 같은 id+status면 무시 |

---

## 3. 기술 구현

### 파일 구조

| 파일 | 역할 |
|------|------|
| `bot/_hooks/useBotStatus.ts` | 폴링(5초) → 상태 변화 감지 → 알림 트리거 |
| `bot/page.tsx` | 토스트 UI 렌더링 |
| `globals.css` | toast-in 애니메이션 + prefers-reduced-motion 대응 |

### 상태 감지 로직

```typescript
// 이전 명령 상태 추적
const prevCommandRef = useRef<{ id: string; status: string } | null>(null);

// botCommands 변경 시 최신 완료/실패 명령 확인
const latest = botCommands
  .filter(c => c.status === "completed" || c.status === "failed")
  .sort((a, b) => (b.completed_at || b.created_at).localeCompare(...))
  [0];

// 이전과 다른 명령이면 알림 발동
if (latest && prevCommandRef.current?.id !== latest.id) {
  // 토스트 + 알림음 + Notification
}
```

---

## 4. 사용자 마일스톤 알림 (텔레그램)

워커에서 1시간마다 사용자 수 체크, 임계점 돌파 시 텔레그램 알림.

| 유저 수 | 알림 메시지 | 조치 |
|---------|-----------|------|
| 10명 | 현행 인프라 OK | — |
| 15명 | LTE 동글 구매 + IP 로테이션 준비 | 화웨이 E8372 + SIM 구매 |
| 20명 | IP 로테이션 구현 착수 | rotate_ip.py 개발 |
| 50명 | Supabase Pro + 클라우드 서버 검토 | 인프라 전환 |
| 100명 | 워커 다중화 + 서버 스펙업 | 분산 아키텍처 |
| 500명 | 분산 아키텍처 전환 | Celery + Redis |
| 1000명 | 축하 | — |

파일: `command_worker.py` `_USER_MILESTONES`, `_MILESTONE_MESSAGES`
