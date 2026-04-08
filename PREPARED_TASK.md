# Prepared Tasks

| # | 태스크 | 우선순위 | depends | 비고 |
|---|--------|----------|---------|------|
| TG-E2E | 텔레그램 봇 통합 E2E 테스트 | P1 | — | 텔레그램 앱에서 수동 테스트 필요 |
| UX-C01 | 카카오 로그인 프로덕션 실동작 검증 | P1 | — | 실제 카카오 로그인 직접 클릭 테스트 필요 |
| COLLECT-PARALLEL | 블로그 수집 병렬화 설계 | P1 | — | 분석 완료: 방문/게시 이미 병렬화됨. 남은 건 comment_collector 폴백 경로 최적화 |
| IP-ROTATION | LTE 동글 IP 로테이션 구현 | P1 | 유저 20명+ | 화웨이 E8372 + HiLink API + WSL2 mirrored |
| INFRA-SERVER | 로컬 PC 의존 탈피 — 클라우드 서버 이전 | P1 | 유저 50명+ | Oracle Cloud Free 먼저 시도 → 실패 시 Vultr 도쿄 |
| BOT-PROGRESS-UI | 댓글 진행률 웹 UI — 게시 버튼 근처 프로그레스바 | P1 | — | API 완료(GET /comment/progress). 웹 UI polling + %바 구현 남음 |
| VISITOR-TRACK-UI | 방문자수 웹 대시보드 — Chart.js 추이 그래프 | P2 | — | 수집 완료. cron 등록 + 웹 UI 시각화 남음 |
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
