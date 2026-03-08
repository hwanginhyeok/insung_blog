# 🏗️ 개발 문서 중앙 관리 시스템

> ⚠️ **중요**: 본 문서는 프로젝트의 모든 개발 방향, 아키텍처, API 명세를 관리하는 **유일한 진실의 원천(Source of Truth)**입니다.
> 
> **어떤 변경이든 이 문서들을 먼저 업데이트한 후 코드를 수정하세요.**

---

## 📁 문서 구조

```
docs/개발/
├── README.md                    # ← 지금 여기 (문서 가이드)
├── 아키텍처/
│   ├── 00-system-overview.md    # 시스템 전체 블록 다이어그램
│   ├── 01-vercel-layer.md       # Vercel (API/UI) 구조
│   ├── 02-database-layer.md     # Supabase (Multi-tenant DB)
│   ├── 03-worker-layer.md       # Worker Pool 구조
│   └── 04-security-flow.md      # 보안 아키텍처
├── API/
│   ├── 00-api-overview.md       # API 전체 목록
│   ├── 01-authentication.md     # 인증/인가
│   ├── 02-generation.md         # 글 생성 API
│   ├── 03-webhooks.md           # Worker 통신 Webhook
│   └── 04-error-codes.md        # 에러 코드 정의
├── DB/
│   ├── 00-schema-overview.md    # 스키마 개요
│   ├── 01-users.sql             # 사용자 테이블
│   ├── 02-generation-queue.sql  # 생성 대기열
│   ├── 03-style-dna.sql         # 스타일 DNA
│   └── 04-rls-policies.sql      # RLS 정책
├── UI/
│   ├── 00-pages.md              # 페이지 목록
│   ├── 01-components.md         # 공통 컴포넌트
│   └── 02-state-management.md   # 상태 관리
├── 배포/
│   ├── 00-deployment-guide.md   # 배포 가이드
│   ├── 01-environment.md        # 환경변수
│   └── 02-monitoring.md         # 모니터링
└── 작업로그/
    ├── 00-sprint-plan.md        # 스프린트 계획
    ├── 01-daily-log.md          # 일일 작업 로그
    └── 99-decisions.md          # 주요 결정 사항
```

---

## 🔄 변경 관리 프로토콜

### 필수 수정 사항
**다음 항목 변경 시 반드시 해당 문서를 먼저 업데이트:**

| 변경 항목 | 수정해야 할 문서 | 담당자 확인 |
|-----------|------------------|-------------|
| 시스템 아키텍처 변경 | `아키텍처/*.md` | ✅ |
| API 엔드포인트 추가/수정 | `API/*.md` | ✅ |
| DB 스키마 변경 | `DB/*.sql` + `DB/*.md` | ✅ |
| UI 페이지/컴포넌트 변경 | `UI/*.md` | ✅ |
| 환경변수 변경 | `배포/01-environment.md` | ✅ |
| 보안 정책 변경 | `아키텍처/04-security-flow.md` | ✅ |

### 문서 수정 워크플로우
```
1. 문서 수정
   ↓
2. [YYYYMMDD-변경내용] 형식으로 작업로그/99-decisions.md에 기록
   ↓
3. 코드 수정
   ↓
4. 테스트
   ↓
5. 배포
```

---

## 🎯 현재 개발 단계

**Phase 0: Multi-tenant MVP (고객 1명 - 형 전용)**

- [ ] 아키텍처 문서 작성
- [ ] Supabase 스키마 생성
- [ ] Vercel 프로젝트 세팅
- [ ] Worker 멀티유저 지원
- [ ] 형 계정 등록 및 테스트

**다음 단계**: Phase 1 (고객 2~5명 확장)

---

## 📝 문서 작성 규칙

1. **모든 문서는 Markdown 형식**
2. **코드 블록은 syntax highlighting 필수**
3. **변경 이력은 문서 하단에 `## Changelog` 섹션으로 기록**
4. **다이어그램은 Mermaid 또는 ASCII Art 사용**

---

## 📅 마지막 업데이트

- **Created**: 2026-03-05
- **Author**: 개발팀
- **Status**: Phase 0 준비 중
