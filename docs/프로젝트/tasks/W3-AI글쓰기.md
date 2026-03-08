# W3: AI 글쓰기 (핵심 기능)

> 사진 + 메모 → AI 초안 → 편집 → 저장/복사
> 작업 디렉토리: `apps/web/`
> 의존성: W1 + W2 완료 후 착수

---

## W3-01: 사진 업로드 UI + Supabase Storage 연동

**목표**: 사진 업로드 → Storage 저장 → URL 획득

**작업 내용**:
1. `app/(dashboard)/write/page.tsx` — 글쓰기 페이지
2. 드래그&드롭 + 클릭 업로드 컴포넌트
3. 사진 미리보기 (썸네일)
4. 순서 변경 (드래그)
5. 최대 10장, 10MB/장 제한
6. Supabase Storage `photos` 버킷에 업로드
7. 업로드 진행률 표시

**포팅 원본**: 기존에는 텔레그램에서 사진 수신 → 로컬 저장
**변경점**: 웹 업로드 → Supabase Storage → URL

**완료 기준**: 사진 업로드 → Storage에 저장 → URL 리스트 획득

---

## W3-02: 메모 입력 + 카테고리 선택 UI

**목표**: 사용자 입력 폼

**작업 내용**:
1. 메모 textarea (장소, 메뉴, 한줄 감상 등)
2. 카테고리 선택 (맛집/카페/여행/일상/기타) — 선택 또는 AI 자동 감지
3. "AI 초안 생성" 버튼
4. react-hook-form + zod 검증 (사진 1장 이상 필수)

**포팅 원본**: `src/ai/memo_parser.py` (ParsedMemo)
**변경점**: 프론트에서 구조화 UI 제공 → 별도 파싱 불필요할 수도

**완료 기준**: 입력 폼 완성 + 검증 동작

---

## W3-03: AI 초안 생성 API Route (/api/generate)

**목표**: content_generator.py의 핵심 로직을 TypeScript로 포팅

**작업 내용**:
1. `app/api/generate/route.ts` — POST 엔드포인트
2. Anthropic TypeScript SDK (`@anthropic-ai/sdk`) 설치
3. 4단계 AI 파이프라인 포팅:
   - Step 1: `analyzeImages()` — Vision으로 사진 분석
   - Step 2: `detectCategory()` — Haiku로 카테고리 감지
   - Step 3: `generateDraft()` — Sonnet으로 PRODUCTION_SPEC 기반 초안
   - Step 4: `generateHashtags()` — Haiku로 해시태그
4. PRODUCTION_SPEC.md → DB 또는 프로젝트 내 파일로 관리
5. Streaming 응답 (초안 생성 중 실시간 표시)
6. generation_queue에 결과 저장

**포팅 원본**: `src/ai/content_generator.py`
**핵심 프롬프트**: `skills/PRODUCTION_SPEC.md` (그대로 사용)

**설계 결정**:
- 이미지: Supabase Storage URL을 Claude Vision에 직접 전달 (base64 불필요)
- few-shot 예시: `skills/blog_analysis/raw_posts.json` → Supabase에 저장 또는 정적 파일
- 타임아웃: Streaming으로 해결

**완료 기준**: 사진+메모 → AI 초안(title, body, hashtags) 반환

---

## W3-04: 초안 렌더링 + 편집기 UI

**목표**: AI 초안을 보여주고 편집 가능하게

**작업 내용**:
1. 초안 미리보기 영역:
   - 제목 (편집 가능)
   - 본문 — [PHOTO_N] 마커 위치에 실제 사진 삽입하여 렌더링
   - 해시태그 목록 (추가/삭제 가능)
2. 본문 편집:
   - 간단한 textarea 편집 (MVP)
   - 또는 리치 에디터 (향후)
3. Streaming 중 로딩 상태 표시

**포팅 원본**: `src/utils/photo_marker.py` (마커 파싱)
**완료 기준**: AI 초안이 사진과 함께 렌더링 + 편집 가능

---

## W3-05: 저장 + 복사하기 기능

**목표**: 최종본 저장 + 네이버 블로그용 복사

**작업 내용**:
1. "저장" — generation_queue.final_html 업데이트
2. "복사하기" 버튼:
   - 텍스트 복사 (제목 + 본문 + 해시태그)
   - HTML 복사 (네이버 블로그 에디터에 리치텍스트로 붙여넣기)
3. 복사 완료 시 토스트 알림
4. 저장 후 대시보드에서 status = "completed"로 표시

**완료 기준**: 복사한 텍스트를 네이버 블로그에 붙여넣기 가능

---

*생성: 2026-03-06*
