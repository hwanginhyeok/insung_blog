# 🚀 Vercel 배포 정보

> **프로젝트**: 인성이프로젝트 (blog-ai-partner)  
> **상태**: ✅ Production 배포 완료  
> **생성일**: 2026-03-05

---

## 📍 배포 URL

### Production
- **Primary**: https://web-h15xbamz8-hwanginhyeoks-projects.vercel.app
- **Alias**: https://web-one-blue-52.vercel.app

### GitHub Repository
- https://github.com/hwanginhyeok/insung_blog

### Vercel Dashboard
- https://vercel.com/hwanginhyeoks-projects/web

---

## ⚙️ 배포 설정

| 항목 | 값 | 비고 |
|------|-----|------|
| Framework | Next.js 14 | Auto-detected |
| Build Command | `npm run build` | 기본값 |
| Output Directory | `.next` | 기본값 |
| Install Command | `npm install` | 기본값 |
| Node Version | 20.x | Vercel 기본 |

---

## 🔧 환경변수 설정 (필요 시)

Vercel Dashboard에서 설정:
```
https://vercel.com/hwanginhyeoks-projects/web/settings/environment-variables
```

추가 예정:
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXTAUTH_SECRET=
```

---

## 📊 빌드 결과

```
Route (app)                              Size     First Load JS
┌ ○ /                                    138 B          87.4 kB
└ ○ /_not-found                          873 B          88.1 kB
+ First Load JS shared by all            87.2 kB

Build Completed in 34s
```

---

## 🔄 재배포 방법

### 자동 재배포
GitHub `master` 브랜치에 push 시 자동 재배포

### 수동 재배포
```bash
cd /home/gint_pcd/projects/인성이프로젝트/apps/web
vercel --prod --token $VERCEL_TOKEN
```

---

## Changelog

- **2026-03-05**: Initial deployment (v0.1.0)
