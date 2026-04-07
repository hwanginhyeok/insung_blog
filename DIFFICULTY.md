# Difficulties & Know-how

> 프로젝트 진행 중 겪은 주요 기술 문제와 해결 노하우.
> git log의 fix/bug 커밋 이력 기반으로 정리.

---

## D-001: 네이버 댓글 모듈 cbox JS 미로드 — 데스크톱→모바일 Playwright 전환

- **날짜**: 2026-03-10 ~ 2026-03-11
- **상황**: 댓글 작성자 수집 기능에서 블로그 게시물의 댓글 영역을 읽어야 하는데, 데스크톱 headless Playwright에서 댓글이 전혀 보이지 않음
- **이슈**: 네이버가 댓글 시스템을 cbox3 → cbox9로 전환하면서 데스크톱 headless에서 JS가 로드되지 않음. iframe 19개가 생성되지만 댓글 영역은 빈 상태
- **삽질**:
  - cbox3 API (`web_naver_list_jsonp.json`) 호출 → 404
  - cbox9 API 직접 호출 → "API does not exist"
  - command.blog.naver.com, CommentListAsync.naver → 전부 404
  - m.blog.naver.com getAllComments API → 로그인 리다이렉트
  - 데스크톱 Playwright PostView iframe 직접 접근 → cbox JS 미로드
  - `a._commentCount` 셀렉터 → 네이버가 CSS 모듈 해시 클래스로 변경하여 폐기
- **해결**: 모바일 Playwright(`m.blog.naver.com`)로 전면 전환. 모바일 UA + 뷰포트 설정 → `[class*="comment_btn"]` 클릭으로 댓글 lazy-load 트리거 → `u_cbox_name` href에서 blogId 추출
- **대안**: (1) 네이버 공식 API 사용 → 댓글 API 비공개라 불가. (2) headful 브라우저 → 서버 환경에서 X11 필요, 운영 부담 큼. (3) cheerio로 SSR HTML 파싱 → 댓글이 CSR이라 불가
- **노하우**: 네이버는 데스크톱/모바일 렌더링이 완전히 다름. 모바일은 단일 페이지 구조라 Playwright 호환성이 좋음. 네이버 크롤링은 **항상 모바일 먼저 시도**할 것
- **회고**: 처음부터 모바일로 갔으면 2일 → 반나절이었음. 데스크톱 iframe 구조를 파악하느라 시간 낭비. "네이버 = 모바일 우선"을 프로젝트 규칙으로 확립했어야 함
- **관련 파일**: `src/collectors/comment_collector.py`, `src/collectors/post_collector.py`, `config/settings.py`

---

## D-002: NID_AUT 쿠키 유실 — context.cookies()가 세션 쿠키를 드롭

- **날짜**: 2026-03-23 ~ 2026-03-30
- **상황**: 봇이 댓글을 정상 게시하다가 갑자기 전체 실패. 로그를 보면 네이버 로그인이 풀려 있음
- **이슈**: Playwright의 `context.cookies()`가 반환하는 쿠키 목록에서 `NID_AUT`(네이버 핵심 인증 쿠키)가 간헐적으로 빠짐. httpOnly 세션 쿠키라서 특정 시점에 브라우저가 만료 처리하거나 반환하지 않음. `_save_cookies()`가 NID_AUT 없는 쿠키로 기존 정상 쿠키를 덮어쓰면서 전체 인증 소실
- **삽질**:
  - 처음에는 쿠키 만료 문제로 생각하고 재로그인 로직을 강화 → 근본 해결 안 됨
  - Supabase에 저장된 쿠키를 확인해보니 NID_AUT만 빠져 있음 → context.cookies() 문제 확인
  - NID_AUT을 수동으로 넣어도 다음 저장 때 또 덮어씀
- **해결**: 쿠키 저장 전 NID_AUT 존재 여부 검증 추가. NID_AUT가 없으면 저장을 스킵하여 기존 정상 쿠키를 보호. 추가로 `ensure_login_cookie_only()`에서 NID_AUT 없으면 Supabase 쿠키 재로드 1회 시도
- **대안**: (1) 매번 ID/PW로 재로그인 → 네이버 캡차 위험 높음. (2) 쿠키를 파일로만 관리 → 다중 서버 시 동기화 문제. (3) CDP에서 직접 쿠키 추출 → Playwright API로 충분
- **노하우**: Playwright context.cookies()는 **httpOnly 세션 쿠키를 항상 반환하지 않음**. 쿠키 저장 시 핵심 쿠키 존재 여부를 반드시 검증하고, 없으면 기존 쿠키를 보호. "덮어쓰기 방어"가 핵심
- **회고**: 쿠키 저장 함수에 검증 로직을 처음부터 넣었어야 함. "저장 전 유효성 검증"은 모든 덮어쓰기 로직의 기본인데 간과. Supabase에 쿠키 히스토리를 남겼으면 롤백도 가능했을 것
- **관련 파일**: `src/auth/naver_login.py`, `command_worker.py`, `tests/test_cookie_validation.py`

---

## D-003: 중복 댓글 폭탄 — pending_comments UNIQUE index 부재

- **날짜**: 2026-03-29 ~ 2026-04-03
- **상황**: 사용자가 같은 블로거 게시물에 댓글이 2~3개씩 중복 게시됨. 154그룹 237건의 중복 데이터 발견
- **이슈**: `pending_comments` 테이블에 `(post_url, user_id)` 조합의 UNIQUE 제약이 없어서, 봇이 동일 게시물에 대해 수집할 때마다 새 댓글이 INSERT됨. 워커 중복 실행(race condition)에서도 동일 문제 발생
- **삽질**:
  - 워커 중복 실행 방지(pidfile + atomic claim) → 줄었지만 완전 해결 안 됨
  - SQLite + Supabase 이중 체크 코드 → 타이밍 이슈로 여전히 빠져나감
  - 게시 전 approved 목록에서 post_url 기준 중복 제거 필터 → 세 번째 방어선, 여전히 불완전
- **해결**: 4단계 다층 방어 구축. (1) INSERT 전 중복 체크, (2) SQLite+Supabase 이중 체크, (3) 게시 전 중복 제거, (4) `CREATE UNIQUE INDEX ... WHERE status IN ('pending','approved','posted')` 적용. 기존 중복은 `fix_duplicate_comments.py`로 154그룹 237건 일괄 정리
- **대안**: (1) INSERT ... ON CONFLICT 사용 → partial index 조건과 맞지 않아 복잡. (2) 앱 레벨 락(Redis) → 인프라 추가 부담. (3) SELECT FOR UPDATE → Supabase REST API에서 지원 안 함
- **노하우**: 중복 방지는 **반드시 DB 수준(UNIQUE index)에서 보장**. 앱 레벨 체크만으로는 race condition을 완전히 막을 수 없음. partial index(`WHERE status IN (...)`)로 논리적 중복만 차단 가능
- **회고**: 테이블 설계 시점에 UNIQUE 제약을 넣었어야 함. "나중에 넣지 뭐"가 154그룹 정리 작업으로 돌아옴. 새 테이블 만들 때 유니크 조건부터 정의하는 습관 필요
- **관련 파일**: `src/storage/supabase_client.py`, `command_worker.py`, `supabase/migrations/20260329_add_unique_pending_comments.sql`

---

## D-004: 페르소나 분석 JSON 파싱 실패 — max_tokens 부족 + 불완전 JSON

- **날짜**: 2026-04-06
- **상황**: 블로그 페르소나 분석(Pass 1)에서 AI가 블록 상세 데이터를 포함한 긴 응답을 생성하는데, JSON이 잘려서 파싱 실패
- **이슈**: `analyze-persona.ts` Pass 1의 max_tokens가 3000이었는데, 블록별 속성 추출 기능 추가로 응답 크기 증가. JSON이 중간에 잘리면 `JSON.parse()` 실패 → 전체 분석 실패. 글 생성에서도 AI가 JSON 대신 마크다운으로 응답하는 경우 발생
- **삽질**:
  - 프롬프트 수정으로 해결 시도 → AI가 여전히 간헐적으로 잘못된 형식 반환
  - `JSON.parse()` 단일 호출 → 실패율 높음
  - 코드블록 마커 제거 1차 폴백 → 일부 해결, 여전히 실패 케이스
- **해결**: (1) max_tokens 3000→6000 상향, (2) 3단계 파싱 폴백: 직접 파싱 → Regex title/body 추출 → `{...}` 경계 추출 후 재파싱. 실패 시 AI 원문 500자 콘솔 출력으로 디버깅 편의성 확보
- **대안**: (1) AI 응답을 JSON 대신 YAML로 받기 → 파싱 라이브러리 추가 필요. (2) structured output(tool_use) → Haiku에서 불안정. (3) 재시도 로직 → 비용 2배
- **노하우**: AI 응답을 JSON으로 받을 때는 (1) max_tokens를 넉넉하게, (2) 다단계 파싱 폴백 필수. assistant prefill(`{"title":`)로 JSON 시작을 강제하는 것도 효과적
- **회고**: 프롬프트에 "JSON만 출력"이라고 써도 AI는 보장하지 않음. 파싱 레이어를 방어적으로 설계하는 게 맞고, max_tokens는 예상 출력의 2배로 설정하는 것이 안전
- **관련 파일**: `apps/web/lib/ai/analyze-persona.ts`, `apps/web/lib/ai/generate-post.ts`

---

## D-005: Supabase 마이그레이션 파일명 타임스탬프 충돌

- **날짜**: 2026-04-05 ~ 2026-04-06
- **상황**: `supabase db push`를 실행하면 마이그레이션이 적용되지 않거나 순서가 꼬임
- **이슈**: 같은 날짜(20260405)에 3개 마이그레이션 파일을 생성하면서 파일명 prefix가 동일. Supabase CLI가 사전순 정렬하는데 의존 관계 순서가 보장되지 않아 충돌. `supabase_migrations` 히스토리 테이블과 파일명 불일치 시 "already applied" 에러
- **삽질**:
  - `supabase db push` → "migration already applied" 에러
  - 히스토리 테이블 직접 조회 → 파일명과 해시 불일치
  - 파일명 변경 → 새 마이그레이션으로 인식 → 이미 적용된 DDL 재실행 시도
  - `IF NOT EXISTS` 모든 DDL에 추가 → 번거롭고 DROP+CREATE엔 적용 불가
  - `supabase migration repair --status reverted` 반복 → 히스토리 꼬임 심화
- **해결**: 같은 날짜 마이그레이션은 `YYYYMMDDHHMMSS` 형식으로 초 단위 지정. `20260405_xxx.sql` → `20260405100000_xxx.sql`, `20260405100001_xxx.sql`로 리네임. DDL에 `DROP ... IF EXISTS` + `CREATE ... IF NOT EXISTS` 패턴으로 멱등성 확보
- **대안**: (1) 마이그레이션 1개로 합치기 → 롤백 단위가 커짐. (2) Supabase Dashboard SQL Editor로 직접 실행 → 히스토리 추적 불가. (3) Prisma/Drizzle ORM → 기존 raw SQL 마이그레이션과 호환 안 됨
- **노하우**: Supabase 마이그레이션 파일명은 **반드시 YYYYMMDDHHMMSS 14자리**. 한번 push된 파일명은 절대 변경 금지. `repair --status reverted`는 최후의 수단이고 히스토리 꼬이면 repair 지옥에 빠짐
- **회고**: 마이그레이션 파일 생성 시 자동으로 타임스탬프를 붙이는 스크립트를 만들었어야 함. `supabase migration new` 명령을 쓰면 자동 생성되는데 수동으로 파일을 만든 게 화근. 앞으로는 CLI 명령 사용
- **관련 파일**: `supabase/migrations/20260405100000_add_proxy_url.sql`, `supabase/migrations/20260406100000_persona_feedback_rls_and_examples.sql`
