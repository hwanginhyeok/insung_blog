# Difficulties & Know-how

> 프로젝트 진행 중 겪은 주요 기술 문제와 해결 노하우.
> git log의 fix/bug 커밋 이력 기반으로 정리.

---

## D-001: 네이버 댓글 모듈 cbox JS 미로드 — 데스크톱→모바일 Playwright 전환

- **날짜**: 2026-03-10 ~ 2026-03-11
- **상황**: 댓글 작성자 수집 기능에서 블로그 게시물의 댓글 영역을 읽어야 하는데, 데스크톱 headless Playwright에서 댓글이 전혀 보이지 않음
- **문제**: 네이버가 댓글 시스템을 cbox3 → cbox9로 전환하면서 데스크톱 headless 브라우저에서 JS가 로드되지 않음. iframe 19개가 생성되지만 댓글 영역은 빈 상태. cbox API도 전부 404/인증 필요로 변경
- **삽질**:
  - cbox3 API (`web_naver_list_jsonp.json`) 호출 → 404
  - cbox9 API 직접 호출 → "API does not exist"
  - command.blog.naver.com, CommentListAsync.naver → 전부 404
  - m.blog.naver.com getAllComments API → 로그인 리다이렉트
  - 데스크톱 Playwright PostView iframe 직접 접근 → cbox JS 미로드
  - `a._commentCount` 셀렉터 → 네이버가 CSS 모듈 해시 클래스로 변경하여 폐기
- **해결**: 모바일 Playwright(`m.blog.naver.com`)로 전면 전환. 모바일 UA + 뷰포트 설정 → `[class*="comment_btn"]` 클릭으로 댓글 lazy-load 트리거 → `u_cbox_name` href에서 blogId 추출. SPA/피드 형태 블로그용 `_extract_log_nos_from_html()` 정규식 폴백도 추가
- **노하우**: 네이버는 데스크톱/모바일 렌더링이 완전히 다름. 데스크톱은 iframe 중첩이 심하고 JS lazy-load가 headless에서 불안정. 모바일은 단일 페이지 구조라 Playwright 호환성이 좋음. 네이버 크롤링은 **항상 모바일 먼저 시도**할 것
- **관련 파일**: `src/collectors/comment_collector.py`, `src/collectors/post_collector.py`, `config/settings.py`
- **관련 커밋**: `5db19ef`, `35ab971`, `2dbaaf9`

---

## D-002: NID_AUT 쿠키 유실 — context.cookies()가 세션 쿠키를 드롭

- **날짜**: 2026-03-23 ~ 2026-03-30
- **상황**: 봇이 댓글을 정상 게시하다가 갑자기 전체 실패. 로그를 보면 네이버 로그인이 풀려 있음
- **문제**: Playwright의 `context.cookies()`가 반환하는 쿠키 목록에서 `NID_AUT`(네이버 핵심 인증 쿠키)가 간헐적으로 빠짐. httpOnly 세션 쿠키라서 특정 시점에 브라우저가 만료 처리하거나 반환하지 않음. 이때 `_save_cookies()`가 NID_AUT 없는 쿠키로 기존 정상 쿠키를 덮어쓰면서 전체 인증 소실
- **삽질**:
  - 처음에는 쿠키 만료 문제로 생각하고 재로그인 로직을 강화 → 근본 해결 안 됨
  - Supabase에 저장된 쿠키를 확인해보니 NID_AUT만 빠져 있음 → context.cookies() 문제 확인
  - NID_AUT을 수동으로 넣어도 다음 저장 때 또 덮어씀
- **해결**: 쿠키 저장 전 NID_AUT 존재 여부 검증 추가. NID_AUT가 없으면 저장을 스킵하여 기존 정상 쿠키를 보호. 추가로 `ensure_login_cookie_only()`에서 NID_AUT 없으면 Supabase 쿠키 재로드 1회 시도 + 워커에서 로그인 성공 후 NID_AUT 검증 로직 추가
- **노하우**: Playwright context.cookies()는 **httpOnly 세션 쿠키를 항상 반환하지 않음**. 쿠키 저장 시 핵심 쿠키(NID_AUT, NID_SES 등) 존재 여부를 반드시 검증하고, 없으면 기존 쿠키를 보호해야 함. "덮어쓰기 방어"가 핵심
- **관련 파일**: `src/auth/naver_login.py`, `command_worker.py`, `tests/test_cookie_validation.py`
- **관련 커밋**: `643c59c`, `551fe7f`, `5749955`

---

## D-003: 중복 댓글 폭탄 — pending_comments UNIQUE index 부재

- **날짜**: 2026-03-29 ~ 2026-04-03
- **상황**: 사용자가 같은 블로거 게시물에 댓글이 2~3개씩 중복 게시됨. 154그룹 237건의 중복 데이터 발견
- **문제**: `pending_comments` 테이블에 `(post_url, user_id)` 조합의 UNIQUE 제약이 없어서, 봇이 동일 게시물에 대해 수집할 때마다 새 댓글이 INSERT됨. 워커가 중복 실행되는 경우(race condition)에도 같은 게시물에 대한 댓글이 여러 개 생성
- **삽질**:
  - 먼저 워커 중복 실행 방지(pidfile + atomic claim)를 구현 → 줄었지만 완전 해결 안 됨
  - SQLite + Supabase 이중 체크 코드를 추가 → 타이밍 이슈로 여전히 빠져나감
  - 게시 전 approved 목록에서 post_url 기준 중복 제거 필터 추가 → 세 번째 방어선
  - 결국 DB 수준의 UNIQUE partial index가 필요하다는 결론
- **해결**: 4단계 다층 방어 구축. (1) INSERT 전 `(post_url, user_id)` 중복 체크, (2) SQLite + Supabase 이중 체크, (3) 게시 전 post_url 기준 중복 제거, (4) `CREATE UNIQUE INDEX ... WHERE status IN ('pending','approved','posted')` 적용. 기존 중복 데이터는 `fix_duplicate_comments.py` 정리 스크립트로 154그룹 237건 일괄 정리
- **노하우**: 중복 방지는 **반드시 DB 수준(UNIQUE index)에서 보장**해야 함. 애플리케이션 레벨 체크만으로는 race condition을 완전히 막을 수 없음. partial index(`WHERE status IN (...)`)로 논리적 중복만 차단 가능
- **관련 파일**: `src/storage/supabase_client.py`, `command_worker.py`, `supabase/migrations/20260329_add_unique_pending_comments.sql`, `tools/fix_duplicate_comments.py`
- **관련 커밋**: `fa7ac64`, `4a48ad7`, `843bdbc`

---

## D-004: 페르소나 분석 JSON 파싱 실패 — max_tokens 부족 + 불완전 JSON

- **날짜**: 2026-04-06
- **상황**: 블로그 페르소나 분석(Pass 1)에서 AI가 블록 상세 데이터를 포함한 긴 응답을 생성하는데, JSON이 잘려서 파싱 실패
- **문제**: `analyze-persona.ts` Pass 1의 max_tokens가 3000으로 설정되어 있었는데, 블록별 정렬/폰트/크기/볼드 속성 추출 기능(`fd7c903`)이 추가되면서 응답 크기가 증가. JSON이 중간에 잘리면 `JSON.parse()` 실패 → 전체 분석 실패. 같은 시기에 글 생성(`generate-post.ts`)에서도 AI가 JSON 대신 마크다운으로 응답하거나 JSON 안에 코드블록 마커를 포함하는 경우 파싱 실패
- **삽질**:
  - 처음에는 프롬프트 수정으로 해결 시도 → AI가 여전히 간헐적으로 잘못된 형식 반환
  - `JSON.parse()` 단일 호출 → 실패율 높음
  - 코드블록 마커(```)를 제거하는 1차 폴백 추가 → 일부 해결, 여전히 실패 케이스 존재
- **해결**: (1) max_tokens 3000→6000으로 상향, (2) 3단계 JSON 파싱 폴백 구현: 1차 직접 파싱 → 2차 코드블록 마커 제거 후 재시도 → 3차 정규식으로 첫 번째 `{...}` 블록 추출 후 파싱. 파싱 실패 시 AI 원문 500자를 콘솔에 출력하여 디버깅 편의성 확보
- **노하우**: AI 응답을 JSON으로 받을 때는 (1) **max_tokens를 넉넉하게** 설정하고, (2) **다단계 파싱 폴백**을 반드시 구현할 것. AI는 프롬프트와 무관하게 마크다운 코드블록으로 감싸거나 추가 설명을 붙이는 경우가 많음. 정규식 `/{[\s\S]*}/` 추출이 최후의 보루
- **관련 파일**: `apps/web/lib/ai/analyze-persona.ts`, `apps/web/lib/ai/generate-post.ts`
- **관련 커밋**: `f1c9107`, `a77aae9`

---

## D-005: Supabase 마이그레이션 파일명 타임스탬프 충돌

- **날짜**: 2026-04-05
- **상황**: `supabase db push`를 실행하면 마이그레이션이 적용되지 않거나 순서가 꼬임
- **문제**: 같은 날짜(20260405)에 3개 마이그레이션 파일을 생성하면서 파일명이 `20260405_add_proxy_url.sql`, `20260405_create_support_tickets.sql`, `20260405_neighbor_rls.sql`로 동일 prefix. Supabase CLI는 파일명 사전순으로 마이그레이션을 정렬하는데, 날짜 부분이 같으면 나머지 문자열 순서로 실행됨. 이때 의존 관계가 있는 마이그레이션의 실행 순서가 보장되지 않아 충돌 발생. 추가로 `supabase_migrations` 히스토리 테이블에 이미 기록된 마이그레이션과 파일명이 불일치하면 "already applied" 에러 발생
- **삽질**:
  - `supabase db push` 실행 → "migration already applied" 에러
  - 히스토리 테이블 직접 조회 → 파일명과 해시 불일치 확인
  - 파일명을 변경하면 새 마이그레이션으로 인식 → 이미 적용된 DDL을 다시 실행하려 함
  - `IF NOT EXISTS`를 모든 DDL에 추가하는 것도 고려 → 너무 번거로움
- **해결**: 같은 날짜 마이그레이션은 `YYYYMMDDHHMMSS` 형식으로 타임스탬프를 초 단위까지 지정. `20260405_xxx.sql` → `20260405100000_xxx.sql`, `20260405100001_xxx.sql`, `20260405100002_xxx.sql`로 리네임. 이후 모든 마이그레이션은 타임스탬프를 초 단위로 생성하는 규칙 적용
- **노하우**: Supabase 마이그레이션 파일명은 **반드시 YYYYMMDDHHMMSS 14자리** 타임스탬프를 사용할 것. 같은 날짜에 여러 마이그레이션이 필요하면 100000, 100001, 100002 식으로 증분. 한번 `supabase db push`로 적용된 마이그레이션은 파일명을 변경하면 안 됨 — 히스토리 테이블과 불일치 발생
- **관련 파일**: `supabase/migrations/20260405100000_add_proxy_url.sql`, `supabase/migrations/20260405100001_create_support_tickets.sql`, `supabase/migrations/20260405100002_neighbor_rls.sql`
- **관련 커밋**: `4ce9d10`
