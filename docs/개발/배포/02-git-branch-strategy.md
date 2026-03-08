# 🌿 Git 브랜치 전략 (Git Flow)

> **버전**: 1.0  
> **적용일**: 2026-03-05  
> **브랜치**: `main` (production), `dev` (development)

---

## 📊 브랜치 구조

```
┌─────────────────────────────────────────────────────────────┐
│                    Git Branch Strategy                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  master (production)  ←──────────────────────────┐         │
│  │                                               │         │
│  │  [Production Deploy]                          │         │
│  │  https://insung-blog.vercel.app               │         │
│  │                                               │         │
│  └─── merge ─────────────────────────────────────┘         │
│        ↑                                                    │
│  dev (development)                                          │
│  │                                                          │
│  │  [Preview Deploy]                                        │
│  │  https://dev-xxx.vercel.app                              │
│  │                                                          │
│  └─── commit/push ───┐                                     │
│                      │                                     │
│              개발/테스트 진행                               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 🎯 브랜치 정의

| 브랜치 | 용도 | 배포 | 보호 |
|--------|------|------|------|
| `master` | 프로덕션 코드 | ✅ Production (자동) | 🔒 직접 push 금지 |
| `dev` | 개발/검증 | ✅ Preview (자동) | ✅ 직접 push 가능 |
| `feature/*` | 기능 개발 (선택) | ❌ 수동 | - |

---

## 🔄 개발 워크플로우

### 1. 일상 개발 (dev 브랜치)

```bash
# 1. dev 브랜치로 전환
git checkout dev

# 2. 개발 진행 (코드 수정)
...

# 3. 커밋 & 푸시
git add .
git commit -m "feat: 기능 설명"
git push origin dev

# 4. Preview URL에서 테스트
# https://dev-xxx.vercel.app (자동 생성됨)
```

### 2. 프로덕션 배포 (master 브랜치)

```bash
# 1. dev 브랜치에서 master로 PR 생성
# GitHub에서: Compare & pull request

# 2. 코드 리뷰 (스스로 확인)
# - [ ] 기능 정상 작동
# - [ ] 콘솔 에러 없음
# - [ ] 모바일 반응형 확인

# 3. PR 머지 (Squash and merge 권장)
# GitHub에서: Merge pull request

# 4. 자동 배포 확인
# https://insung-blog.vercel.app
```

---

## ✅ 배포 체크리스트

### dev → Preview 배포 (자동)
- [ ] `git push origin dev` 실행
- [ ] Vercel Preview URL 확인
- [ ] 기능 정상 작동 테스트

### dev → master → Production 배포 (수동 PR)
- [ ] GitHub에서 PR 생성 (`dev` → `master`)
- [ ] PR 설명 작성 (변경사항 요약)
- [ ] Preview URL에서 최종 테스트
- [ ] Review 완료 (self-review)
- [ ] Squash and Merge 실행
- [ ] Production URL에서 확인

---

## 🛡️ 브랜치 보호 규칙 (GitHub 설정 권장)

### master 브랜치 보호
```
Settings → Branches → Add rule
├─ Branch name pattern: master
├─ Require a pull request before merging: ✅
├─ Require approvals: 0 (혼자 개발 시)
├─ Require status checks to pass: ✅
│   └─ Vercel Deployment
└─ Restrict pushes that create files: ✅
```

### dev 브랜치
- 보호 규칙 없음 (자유롭게 push 가능)

---

## 📝 커밋 메시지 컨벤션

| 타입 | 설명 | 예시 |
|------|------|------|
| `feat` | 새 기능 | `feat: Add image upload component` |
| `fix` | 버그 수정 | `fix: Resolve login redirect issue` |
| `docs` | 문서 수정 | `docs: Update API documentation` |
| `style` | 코드 스타일 | `style: Format with prettier` |
| `refactor` | 리팩토링 | `refactor: Extract auth hook` |
| `chore` | 기타 작업 | `chore: Update dependencies` |

**형식**: `<type>: <description>` (한글/영문 모두 가능)

---

## 🚀 현재 브랜치 상태

```bash
$ git branch -a

* dev                    ← 현재 작업 브랜치
  master                 ← 프로덕션 브랜치
  remotes/origin/dev     ← GitHub dev
  remotes/origin/master  ← GitHub master
```

**원격 URL**: https://github.com/hwanginhyeok/insung_blog

---

## ⚠️ 주의사항

1. **master에 직접 push 금지**
   - 반드시 `dev` → PR → `master` 순서로만 머지

2. **dev에서만 개발**
   - 모든 개발은 `dev` 브랜치에서 진행

3. **배포 전 테스트**
   - Preview URL에서 충분히 테스트 후 Production 배포

4. **긴급 핫픽스**
   - 예외적으로 `hotfix/*` 브랜치에서 `master`로 직접 PR 가능

---

## Changelog

- **2026-03-05**: 브랜치 전략 수립 및 dev 브랜치 생성 (v1.0)
