# 📝 일일 작업 로그

> **템플릿**: 매일 작업 시작/종료 시 작성  
> **위치**: 본 파일에 append (최신이 위로)  
> **형식**: Markdown

---

## 템플릿

```markdown
### 2026-03-05 (수) - Vercel 세팅

**목표**: 
- Next.js 14 + shadcn/ui 프로젝트 초기화
- Vercel 배포 준비

**완료한 작업**:
- [x] `apps/web/` 디렉토리 생성
- [x] Next.js 14 + TypeScript + Tailwind 설치
- [x] shadcn/ui 초기화 (stone base color)
- [x] 기본 컴포넌트 설치 (button, card, input, textarea)
- [x] 필수 패키지 설치 (Supabase, NextAuth, Zod, react-hook-form, date-fns)
- [x] `.env.example` 환경변수 템플릿 생성
- [x] `.gitignore` 설정 (.env.local, .env)
- [x] 랜딩 페이지 생성 (간단한 소개 페이지)
- [x] Git 커밋 완료 (`5811834`)
- [x] 로컬 개발 서버 실행 확인 (http://localhost:3000)

**완료한 작업 (추가)**:
- [x] GitHub remote 연결 (`hwanginhyeok/insung_blog`)
- [x] GitHub Push 완료 (master 브랜치)
- [x] Vercel CLI 설치
- [x] Vercel 배포 완료
  - Production URL: https://web-h15xbamz8-hwanginhyeoks-projects.vercel.app
  - Build 성공 (Next.js 14, 34s)

**진행 중인 작업**:
- 배포 URL 테스트
- 문서 업데이트

**블로커 (이슈)**:
- 없음

**내일 계획**:
- Supabase 프로젝트 생성
- 환경변수 Vercel에 설정
- DB 스키마 마이그레이션

**메모**:
- npm audit 경고 있지만 Phase 0 개발에는 영향 없음 (나중에 처리)
- shadcn/ui stone 테마가 깔끔하게 적용됨

### YYYY-MM-DD (요일) 
```

---

## 2026-03-05 (수)

**목표**: 
- 개발 문서 체계 수립
- Phase 0 스프린트 계획 수립

**완료한 작업**:
- [x] 개발 문서 디렉토리 구조 생성
- [x] `README.md` (문서 가이드) 작성
- [x] `00-system-overview.md` (시스템 아키텍처) 작성
- [x] `05-file-structure.md` (파일 구조) 작성
- [x] `99-decisions.md` (결정 사항) 작성
- [x] `00-sprint-plan.md` (스프린트 계획) 작성
- [x] 본 템플릿 작성

**진행 중인 작업**:
- 문서 체계 검토 및 피드백 반영

**블로커 (이슈)**:
- 없음

**내일 계획**:
- Vercel + Supabase 프로젝트 생성
- Next.js 기본 세팅

**메모**:
- 멀티테넌트 구조로 결정 (ADR-001)
- 형 계정 1개로 Phase 0 시작

---

*(이전 로그 없음)*
