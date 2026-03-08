# 📋 주요 결정 사항 및 변경 이력

> **목적**: 프로젝트의 모든 주요 아키텍처 결정, 기술 선택, 변경 사항을 기록  
> **형식**: [YYYY-MM-DD] 제목 - 결정자  
> **원칙**: 코드 변경 전 반드시 본 파일에 먼저 기록

---

## 🏛️ 아키텍처 결정 (Architecture Decisions)

### ADR-001: 멀티테넌트 구조 채택
- **날짜**: 2026-03-05
- **결정자**: 개발팀
- **상태**: ✅ Accepted
- **배경**: 초기 단일 사용자(형)로 시작하되, 향후 고객 확장을 염두에 둠
- **결정**: 
  - Phase 0부터 Multi-tenant DB 구조 사용
  - 모든 테이블에 `user_id` FK 추가
  - RLS (Row Level Security)로 데이터 격리
- **대안**: 단일 테넌트 (Single-tenant) - 거부 (나중에 마이그레이션 비용 큼)
- **영향**: 초기 개발 공수 ↑, 향후 확장성 ↑

### ADR-002: Vercel + Supabase + Local Worker 하이브리드
- **날짜**: 2026-03-05
- **결정자**: 개발팀
- **상태**: ✅ Accepted
- **배경**: 네이버 자동화(Playwright)는 서버리스에서 불가능
- **결정**:
  - Vercel: API + UI (Serverless)
  - Supabase: DB + Storage (Managed)
  - Local Worker: Playwright 실행 (집 PC)
- **대안**: 
  - AWS EC2 전체 호스팅 - 거부 (비용 $50+/월)
  - Chrome Extension - 거부 (UX 복잡함)
- **영향**: Worker 가용성 이슈, 비용 최소화

### ADR-003: Next.js 14 App Router 채택
- **날짜**: 2026-03-05
- **결정자**: 개발팀
- **상태**: ✅ Accepted
- **배경**: Vercel 최적화, React Server Components 활용
- **결정**: App Router 사용, Page Router 마이그레이션 없음 (신규 프로젝트)
- **대안**: Page Router - 거부 (신규 프로젝트에 불필요)

---

## 🔧 기술 선택 (Technology Choices)

### TECH-001: Python Worker 유지 (Node.js 마이그레이션 보류)
- **날짜**: 2026-03-05
- **결정자**: 개발팀
- **상태**: ✅ Accepted
- **배경**: 기존 Playwright 코드가 Python으로 작성됨
- **결정**: 
  - Worker는 Python 유지
  - Web은 Next.js (TypeScript)
  - 언어 혼용 허용
- **향후 검토**: Worker 성능 이슈 시 Node.js + Puppeteer 고려

### TECH-002: Supabase (PostgreSQL) 선택
- **날짜**: 2026-03-05
- **결정자**: 개발팀
- **상태**: ✅ Accepted
- **배경**: 관리형 PostgreSQL, Realtime, RLS 지원
- **결정**: Supabase Free Tier 시작 → Pro로 업그레이드
- **대안**: 
  - PlanetScale (MySQL) - 거부 (RLS 복잡)
  - AWS RDS - 거부 (관리 오버헤드)

### TECH-003: shadcn/ui + Tailwind CSS
- **날짜**: 2026-03-05
- **결정자**: 개발팀
- **상태**: ✅ Accepted
- **배경**: 빠른 UI 개발, 일관된 디자인
- **결정**: shadcn/ui 컴포넌트 기반으로 커스터마이징

---

## 📝 변경 이력 (Change Log)

### 2026-03-05: 개발 문서 체계 수립
- **변경**: `docs/개발/` 디렉토리 생성 및 문서 템플릿 작성
- **영향**: 향후 모든 개발 문서는 본 디렉토리에서 관리
- **관련 파일**: 
  - `docs/개발/README.md`
  - `docs/개발/아키텍처/00-system-overview.md`
  - `docs/개발/아키텍처/05-file-structure.md`

### 2026-03-05: Phase 0 범위 확정
- **변경**: 고객 1명(형) 대상 MVP로 범위 축소
- **이유**: 사업화 리스크 검토 후 신중한 접근 결정
- **향후 계획**: Phase 1 (고객 2~5명)은 Phase 0 안정화 후 검토

---

## ⚠️ 알려진 이슈 및 제약

### ISSUE-001: Worker 가용성
- **설명**: 집 PC 전원/인터넷 종료 시 서비스 중단
- **영향도**: High (고객 1명이므로 형이 직접 대응)
- **완화책**: 
  - 텔레그램 알림 (Worker offline)
  - 자동 재시도 큐 (24시간 유지)
- **해결 일정**: Phase 2 (Worker Pool 도입 시)

### ISSUE-002: 네이버 IP 차단 리스크
- **설명**: 다중 계정 동시 접속 시 네이버에서 비정상 접근으로 판단
- **영향도**: Critical (Phase 1 이상)
- **완화책**: 
  - Phase 0: 단일 계정 (형)으로 리스크 최소화
  - Phase 1+: 작업 시간 분산 (랜덤 딜레이)
  - Phase 2+: 프록시 로테이션

### ISSUE-003: Vercel Hobby 플랜 한도
- **설명**: 함수 실행 시간 10초, 배포 일 100회 제한
- **영향도**: Medium
- **완화책**: 
  - 긴 작업은 Queue 패턴 사용
  - 배포는 수동으로 제어

---

## 🚧 진행 중인 결정 (Pending Decisions)

### DECISION-001: 결제 시스템 도입 여부
- **상태**: 🔄 Pending
- **설명**: Phase 1 이상 고객 유치 시 결제 필요
- **옵션**:
  - Toss Payments (한국)
  - Stripe (글로벌)
  - 수동 계좌이체 (초기)
- **결정 기한**: Phase 0 완료 후

### DECISION-002: 텔레그램 봇 연동 방식
- **상태**: 🔄 Pending
- **설명**: Web Dashboard와 병행하여 텔레그램으로 간편 입력 지원
- **옵션**:
  - 별도 Telegram Bot (기존 코드 재사용)
  - Web Dashboard만 제공 (텔레그램 폐기)
- **결정 기한**: Phase 0 개발 중

---

## 📊 메트릭스 (Metrics)

| 지표 | 현재 값 | 목표 | 측정 시점 |
|------|---------|------|----------|
| 문서화율 | 20% | 100% | Phase 0 종료 시 |
| 코드 커버리지 | 0% | 70% | Phase 0 종료 시 |
| Worker 가동률 | - | 95%+ | 상시 |
| API 응답 시간 | - | <200ms | Phase 0 종료 시 |

---

## 🔗 참고 자료

- [Vercel Architecture](https://vercel.com/docs/concepts/architecture/overview)
- [Supabase RLS](https://supabase.com/docs/guides/auth/row-level-security)
- [Multi-tenant SaaS](https://supabase.com/blog/2023/02/22/supabase-tips#multi-tenant-saas)

---

**마지막 업데이트**: 2026-03-05  
**다음 검토**: 2026-03-12 (주간 회의)
