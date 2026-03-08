# 🏃 Sprint Plan: Phase 0 (Multi-tenant MVP)

> **기간**: 2026-03-05 ~ 2026-03-19 (2주)  
> **목표**: 형 계정 1개로 End-to-End 흐름 완성  
> **완료 기준**: 사진 업로드 → AI 글 생성 → 네이버 발행 → 완료 알림

---

## 📋 스프린트 백로그

### Week 1: 인프라 & 기초 (03/05 ~ 03/12)

#### Day 1-2: 프로젝트 세팅
| ID | 작업 | 담당 | 예상 | 상태 | 산출물 |
|----|------|------|------|------|--------|
| W1-T1 | Vercel 프로젝트 생성 및 Git 연결 | - | 1h | ⬜ | Vercel URL |
| W1-T2 | Supabase 프로젝트 생성 | - | 1h | ⬜ | DB Connection String |
| W1-T3 | Next.js 14 기본 세팅 (shadcn/ui) | - | 2h | ⬜ | `apps/web/` 초기화 |
| W1-T4 | Python Worker 디렉토리 구조 생성 | - | 1h | ⬜ | `apps/worker/` 구조 |
| W1-T5 | 환경변수 템플릿 작성 (.env.example) | - | 30m | ⬜ | `.env.example` |

#### Day 3-4: Database 설계
| ID | 작업 | 담당 | 예상 | 상태 | 산출물 |
|----|------|------|------|------|--------|
| W1-T6 | users 테이블 생성 | - | 1h | ⬜ | `00001_create_users.sql` |
| W1-T7 | generation_queue 테이블 생성 | - | 1h | ⬜ | `00002_create_queue.sql` |
| W1-T8 | style_dna 테이블 생성 | - | 1h | ⬜ | `00003_create_dna.sql` |
| W1-T9 | RLS 정책 설정 | - | 2h | ⬜ | `00004_setup_rls.sql` |
| W1-T10 | 형 계정 시드 데이터 준비 | - | 30m | ⬜ | `seed.sql` (암호화) |

#### Day 5-7: 인증 & 기본 API
| ID | 작업 | 담당 | 예상 | 상태 | 산출물 |
|----|------|------|------|------|--------|
| W1-T11 | NextAuth.js 설정 (Credentials) | - | 2h | ⬜ | `/api/auth/[...nextauth]` |
| W1-T12 | Supabase Client 설정 | - | 1h | ⬜ | `lib/supabase.ts` |
| W1-T13 | Middleware (인증/리다이렉트) | - | 1h | ⬜ | `middleware.ts` |
| W1-T14 | 로그인 페이지 UI | - | 2h | ⬜ | `/login/page.tsx` |
| W1-T15 | 기본 레이아웃 (Header/Sidebar) | - | 2h | ⬜ | Dashboard 레이아웃 |

---

### Week 2: 핵심 기능 (03/13 ~ 03/19)

#### Day 8-9: 글 생성 플로우
| ID | 작업 | 담당 | 예상 | 상태 | 산출물 |
|----|------|------|------|------|--------|
| W2-T1 | 사진 업로드 컴포넌트 | - | 2h | ⬜ | `ImageUpload.tsx` |
| W2-T2 | 메모 입력 폼 | - | 1h | ⬜ | `GenerateForm.tsx` |
| W2-T3 | `/api/generate` API 구현 | - | 2h | ⬜ | Job 생성 엔드포인트 |
| W2-T2 | 대시보드 메인 페이지 | - | 2h | ⬜ | `/[userId]/page.tsx` |
| W2-T3 | 히스토리 목록 페이지 | - | 2h | ⬜ | `/[userId]/history/page.tsx` |

#### Day 10-11: Worker 구현
| ID | 작업 | 담당 | 예상 | 상태 | 산출물 |
|----|------|------|------|------|--------|
| W2-T4 | Worker 폴리 (Supabase 연결) | - | 2h | ⬜ | `core/poller.py` |
| W2-T5 | UserSession 클래스 (격리) | - | 3h | ⬜ | `core/session.py` |
| W2-T6 | Claude API 연동 | - | 2h | ⬜ | `services/claude_api.py` |
| W2-T7 | 기존 Playwright 코드 마이그레이션 | - | 3h | ⬜ | `services/naver_browser.py` |

#### Day 12-13: 통합 & 테스트
| ID | 작업 | 담당 | 예상 | 상태 | 산출물 |
|----|------|------|------|------|--------|
| W2-T8 | Webhook 콜백 구현 | - | 2h | ⬜ | `/api/webhooks/job-complete` |
| W2-T9 | 실시간 알림 (SSE 또는 Polling) | - | 2h | ⬜ | `useRealtime.ts` |
| W2-T10 | E2E 테스트 (형 계정으로) | - | 2h | ⬜ | Test 결과 |
| W2-T11 | 에러 핸들링 및 로깅 | - | 2h | ⬜ | Error Boundary |

#### Day 14: 버퍼 & 문서화
| ID | 작업 | 담당 | 예상 | 상태 | 산출물 |
|----|------|------|------|------|--------|
| W2-T12 | 버그 수정 | - | 4h | ⬜ | - |
| W2-T13 | 문서 업데이트 | - | 2h | ⬜ | API 문서, DB 문서 |
| W2-T14 | 배포 | - | 1h | ⬜ | Production 배포 |

---

## 📊 일정 시각화

```
Week 1 (03/05 ~ 03/12)
├─ Mon: T1~T5  [프로젝트 세팅]
├─ Tue: T6~T7  [DB 테이블 1/2]
├─ Wed: T8~T10 [DB 테이블 2/2 + RLS]
├─ Thu: T11~T13 [인증 설정]
├─ Fri: T14~T15 [UI 레이아웃]
└─ Sat/Sun: 버퍼

Week 2 (03/13 ~ 03/19)
├─ Mon: W2-T1~T3  [글 생성 UI]
├─ Tue: W2-T4~T5  [Worker 폴리/세션]
├─ Wed: W2-T6~T7  [AI/브라우저 연동]
├─ Thu: W2-T8~T9  [웹훅/알림]
├─ Fri: W2-T10~T11 [테스트/에러핸들링]
└─ Sat/Sun: W2-T12~T14 [버퍼/배포]
```

---

## 🎯 완료 기준 (Definition of Done)

### 기능적 완료
- [ ] 형이 로그인하여 대시보드 접근 가능
- [ ] 사진 3장 + 메모 입력 후 "생성" 클릭
- [ ] 30초~2분 내 AI 글 생성 완료
- [ ] 생성된 글 미리보기에서 확인 가능
- [ ] "발행" 클릭 시 네이버 블로그에 실제 발행
- [ ] 발행 완료 알림 수신 (Web 또는 Telegram)

### 비기능적 완료
- [ ] RLS 정책 정상 작동 (타 사용자 데이터 접근 불가)
- [ ] Worker가 형 계정 쿠키만 사용 (격리 확인)
- [ ] API 응답 시간 < 500ms (P95)
- [ ] 에러 발생 시 로그 및 알림

---

## ⚠️ 리스크 & 대응

| 리스크 | 확률 | 영향 | 대응 |
|--------|------|------|------|
| 네이버 로그인 셀렉터 변경 | 중 | 높음 | debug 모드 유지, 수동 로그인 fallback |
| Supabase Free Tier 한도 초과 | 낮음 | 중 | 모니터링, 500MB 내 관리 |
| Claude API Rate Limit | 중 | 중 | Exponential backoff, retry queue |
| Worker PC 오프라인 | 중 | 높음 | 재시도 큐 24시간 유지, 텔레그램 알림 |

---

## 📚 참고 자료

- [NextAuth.js](https://next-auth.js.org/)
- [Supabase Migration](https://supabase.com/docs/guides/cli/managing-environments)
- [shadcn/ui](https://ui.shadcn.com/)

---

**생성일**: 2026-03-05  
**수정일**: 2026-03-05  
**다음 검토**: 2026-03-12 (Week 1 종료 시)
