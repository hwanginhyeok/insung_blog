# Prepared Tasks

| # | 태스크 | 우선순위 | depends | 비고 |
|---|--------|----------|---------|------|
| TG-E2E | 텔레그램 봇 통합 E2E 테스트 | P1 | — | 텔레그램 앱에서 수동 테스트 필요 |
| UX-C01 | 카카오 로그인 프로덕션 실동작 검증 | P1 | — | 실제 카카오 로그인 직접 클릭 테스트 필요 |
| COLLECT-PARALLEL | 블로그 수집 병렬화 설계 | P1 | — | asyncio.gather 병렬화. 수집 5분→2분 예상 |
| IP-ROTATION | LTE 동글 IP 로테이션 구현 | P1 | 유저 20명+ | 화웨이 E8372 + HiLink API + WSL2 mirrored |
| NEIGHBOR-E2E | 이웃 연동 기능 실행 테스트 | P1 | — | 브라우저 필요 — 추천/동기화/테마분석 E2E |
| INFRA-SERVER | 로컬 PC 의존 탈피 — 클라우드 서버 이전 | P1 | 유저 50명+ | Oracle Cloud Free 먼저 시도 → 실패 시 Vultr 도쿄 |
| BLOG-AUTO | 네이버 블로그 글 자동화 (AI 글 생성 → 자동 발행 파이프라인) | P2 | — | 기존 PUBLISH(수동 발행) 확장 |
| PROXY-DEPLOY | 프록시 실제 도입 | P2 | 유저 30명+ | 주거용 프록시 구매 + 유저별 할당 |
| SUPABASE-PRO | Supabase Pro 플랜 전환 검토 | P2 | 유저 50명+ | ₩35,000/월. Storage 1GB/API 500K 한도 |
| W4-04 | 사용자 확장 준비 (회원가입 오픈 + OAuth) | P2 | — | OAuth는 개발자 콘솔 앱 등록 필요 |
| EXT-05 | OAuth 소셜 로그인 (Kakao/Naver) | P2 | W4-04 | 코드+DB 준비됨, 개발자 콘솔 앱 등록 미완 |
| LOC-05 | blog_publisher.py 셀렉터 업데이트 | P2 | — | 브라우저 실행 필요, DOM 덤프 분석 후 |
