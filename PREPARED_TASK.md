# Prepared Tasks

| # | 태스크 | 우선순위 | depends | 비고 |
|---|--------|----------|---------|------|
| UX-C01 | 카카오 로그인 + 신규 가입 텔레그램 알림 검증 | P1 | — | 실제 카카오 로그인 클릭 + `apps/web/app/api/auth/kakao/callback/route.ts` 4-3 branch `notifyAdmin` 수신 확인 |
| IP-ROTATION | LTE 동글 IP 로테이션 구현 | P1 | 유저 20명+ | 화웨이 E8372 + HiLink API + WSL2 mirrored |
| ADMIN-USAGE-LOGS | 관리페이지 사용 내역 Phase 2 — 로그인/에러/API 수집 | P2 | ADMIN-USAGE-DETAIL | 신규 login_log + error_log 테이블. auth.audit_log_entries view wrapper 검토. API는 집계 테이블(daily_api_usage) 방식 |
| INFRA-SERVER | 로컬 PC 의존 탈피 — 클라우드 서버 이전 | P1 | 유저 50명+ | Oracle Cloud Free 먼저 시도 → 실패 시 Vultr 도쿄 |
| BOT-PROGRESS-UI | 댓글 진행률 웹 UI — 게시 버튼 근처 프로그레스바 | P1 | — | API 완료(GET /comment/progress). 웹 UI polling + %바 구현 남음 |
| BLOG-AUTO | 네이버 블로그 글 자동화 (AI 글 생성 → 자동 발행 파이프라인) | P2 | — | 기존 PUBLISH(수동 발행) 확장 |
| PROXY-DEPLOY | 프록시 실제 도입 | P2 | 유저 30명+ | 주거용 프록시 구매 + 유저별 할당 |
| SUPABASE-PRO | Supabase Pro 플랜 전환 검토 | P2 | 유저 50명+ | ₩35,000/월. Storage 1GB/API 500K 한도 |
| W4-04 | 사용자 확장 준비 (회원가입 오픈 + OAuth) | P2 | — | OAuth는 개발자 콘솔 앱 등록 필요 |
| EXT-05 | OAuth 소셜 로그인 (Kakao/Naver) | P2 | W4-04 | 코드+DB 준비됨, 개발자 콘솔 앱 등록 미완 |
| LOC-05 | blog_publisher.py 셀렉터 업데이트 | P2 | — | 브라우저 실행 필요, DOM 덤프 분석 후 |
| MARKETING-01 | 마케팅 방안 — AI 명시 홍보 + 커뮤니티 10명 확보 | P2 | — | AI기본법 준수 겸 홍보. 블수모/아이보스/크몽. 가격 월19,900원. 상세: [plans/biz-growth-plan.md](docs/프로젝트/plans/biz-growth-plan.md) |
| NOTIFY-KAKAO-CONNECT | 알림 실 연동 — FCM+카카오 환경변수 설정 | P2 | 사업자등록(알림톡) | 라우터 코드 완료. Firebase 콘솔/카카오 OAuth 설정 필요 |
| BIZ-MODEL | 체험단 플랫폼 — 블로거↔가게 무료 알선→유료 컨설팅 | P2 | 블로거 20명+ | MVP 설계 완료. 상세: [plans/biz-growth-plan.md](docs/프로젝트/plans/biz-growth-plan.md) |
| PERSONA-EDITOR | 페르소나 편집 UX 개선 — 팝업+비교+드래그 복사 | P1 | — | 내 페르소나 팝업 보기 + 수정 버튼 + 두 페르소나 비교 + 항목 드래그 복사/삭제 |
| SUPABASE-MAXROWS | Supabase PostgREST max_rows 설정 조정 | P2 | — | 예시 페르소나 84개 중 45개만 반환. 대시보드에서 max_rows 올려야 함 |
| NOTIFY-SELFTEST | 알림 경로 셀프테스트 (5xx/버그리포트/일일리포트) | P1 | — | 지금 가능(의존성 없음): FastAPI 500 유도 → `notify_bug_report` + support_tickets POST + `scripts/daily_admin_report.py --force` 3건 수신 확인. 서비스 재배포/등록 불필요 |
| NOTIFY-OAUTH-NAVER | 네이버 신규 가입 텔레그램 알림 검증 | P1 | 네이버 개발자 콘솔 앱 등록 | 실 네이버 가입 플로우 → `apps/web/app/api/auth/naver/callback/route.ts` 4-3 branch `notifyAdmin` 수신 확인. EXT-05와 함께 진행 |
| NOTIFY-PORTONE | 포트원 결제 알림 검증 (Paid/Failed/BillingKey.Deleted) | P2 | 사업자등록 + 실 결제 | `apps/web/app/api/webhooks/portone/route.ts` 3개 webhook 경로 `notifyAdmin` 수신 확인. 사업자등록증 없이는 포트원 라이브 모드 불가 |
| PERSONA-DOWNGRADE | 페르소나 티어 다운그레이드 트리거 구현 | P2 | 결제 유저 발생 | PERSONA-TIER-SPLIT Phase 4. Pro→Basic 시 가장 최근 1개만 활성/나머지 locked, Basic→Free 시 본인 페르소나 locked. 결제 웹훅(`apps/web/app/api/webhooks/portone/route.ts`)에서 티어 변경 직후 동기 호출. 재업그레이드 시 자동 복구. 현재는 결제 사용자 0명이라 우선순위 낮음 |
| PERSONA-PREVIEW-LIVE | 페르소나 미리보기 실시간 생성 (Pro 한정) | P2 | PERSONA-TIER-SPLIT Phase 3 | 본인 페르소나 미리보기 탭에 "🔄 미리보기 생성" 버튼. Claude API로 글쓰기 2개 + 댓글 3개 + 답글 3개 즉석 생성 후 `persona_preview_samples` 캐싱. monthly_gen_count 차감. Phase 2에서는 정적 시딩만, 이건 Phase 4 |
