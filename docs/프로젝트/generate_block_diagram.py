"""인성이프로젝트 — 구현 현황 블록 다이어그램 생성"""
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.patches import FancyBboxPatch
from matplotlib import font_manager
import numpy as np

# 한글 폰트 — 직접 경로 등록
_font_regular = "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"
_font_bold = "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"
font_manager.fontManager.addfont(_font_regular)
font_manager.fontManager.addfont(_font_bold)
plt.rcParams["font.family"] = font_manager.FontProperties(fname=_font_regular).get_name()
plt.rcParams["axes.unicode_minus"] = False

fig, ax = plt.subplots(1, 1, figsize=(22, 28))
ax.set_xlim(0, 22)
ax.set_ylim(0, 28)
ax.axis("off")
fig.patch.set_facecolor("#0D1117")

# ── 색상 정의 ──
C_DONE = "#2EA043"       # 초록 — 완료
C_DONE_BG = "#1B3928"
C_TODO = "#DA3633"       # 빨강 — 미완료
C_TODO_BG = "#3D1F1F"
C_PARTIAL = "#D29922"    # 노랑 — 부분완료
C_PARTIAL_BG = "#3D3117"
C_HEADER = "#58A6FF"     # 파란 — 헤더
C_HEADER_BG = "#161B22"
C_BORDER = "#30363D"
C_TEXT = "#E6EDF3"
C_SUBTEXT = "#8B949E"
C_SECTION_BG = "#161B22"
C_ARROW = "#484F58"


def draw_box(x, y, w, h, text, bg, border, text_color=C_TEXT, fontsize=10,
             bold=False, radius=0.03, status_dot=None, subtext=None):
    """둥근 박스 그리기"""
    box = FancyBboxPatch(
        (x, y), w, h,
        boxstyle=f"round,pad=0.02,rounding_size={radius}",
        facecolor=bg, edgecolor=border, linewidth=1.2,
    )
    ax.add_patch(box)
    weight = "bold" if bold else "normal"

    # 상태 dot
    if status_dot:
        ax.plot(x + 0.25, y + h / 2 + (0.08 if subtext else 0),
                "o", color=status_dot, markersize=7, zorder=5)
        text_x = x + 0.55
    else:
        text_x = x + w / 2

    if status_dot:
        ha = "left"
        va = "center" if not subtext else "bottom"
        ax.text(text_x, y + h / 2 + (0.05 if subtext else 0),
                text, fontsize=fontsize, color=text_color, fontweight=weight,
                ha=ha, va=va, zorder=5)
        if subtext:
            ax.text(text_x, y + h / 2 - 0.12,
                    subtext, fontsize=7.5, color=C_SUBTEXT,
                    ha=ha, va="top", zorder=5)
    else:
        ax.text(text_x, y + h / 2 + (0.08 if subtext else 0),
                text, fontsize=fontsize, color=text_color, fontweight=weight,
                ha="center", va="center", zorder=5)
        if subtext:
            ax.text(text_x, y + h / 2 - 0.15,
                    subtext, fontsize=8, color=C_SUBTEXT,
                    ha="center", va="top", zorder=5)


def draw_section(x, y, w, h, title):
    """섹션 배경 + 제목"""
    box = FancyBboxPatch(
        (x, y), w, h,
        boxstyle="round,pad=0.02,rounding_size=0.05",
        facecolor=C_SECTION_BG, edgecolor=C_BORDER, linewidth=1.5,
        linestyle="--",
    )
    ax.add_patch(box)
    ax.text(x + 0.3, y + h - 0.25, title,
            fontsize=12, color=C_HEADER, fontweight="bold",
            ha="left", va="top", zorder=5)


def draw_arrow(x1, y1, x2, y2, color=C_ARROW):
    ax.annotate("", xy=(x2, y2), xytext=(x1, y1),
                arrowprops=dict(arrowstyle="-|>", color=color, lw=1.5))


# ═══════════════════════════════════════════
# 타이틀
# ═══════════════════════════════════════════
ax.text(11, 27.5, "인성이프로젝트 — 전체 구현 현황", fontsize=20,
        color=C_TEXT, fontweight="bold", ha="center", va="center")
ax.text(11, 27.1, "2026-03-09  |  완료 ● / 미완료 ● / 부분완료 ●",
        fontsize=10, color=C_SUBTEXT, ha="center")

# 범례
for i, (label, color) in enumerate([("완료", C_DONE), ("미완료", C_TODO), ("부분완료", C_PARTIAL)]):
    ax.plot(8.2 + i * 2.2, 26.7, "s", color=color, markersize=10)
    ax.text(8.5 + i * 2.2, 26.7, label, fontsize=9, color=C_TEXT, va="center")

# ═══════════════════════════════════════════
# SECTION 1: 웹 플랫폼 (메인)
# ═══════════════════════════════════════════
draw_section(0.3, 14.5, 21.4, 12, "웹 플랫폼  (Next.js 14 + Supabase + Vercel)")

# ── Row 1: 인프라 + 인증 ──
row_y = 25.4
draw_box(0.8, row_y, 3.2, 0.7, "W1  인프라 세팅", C_DONE_BG, C_DONE,
         bold=True, status_dot=C_DONE, subtext="Supabase · Storage · 레이아웃")
draw_box(4.3, row_y, 3.2, 0.7, "W2  인증 + 대시보드", C_DONE_BG, C_DONE,
         bold=True, status_dot=C_DONE, subtext="Auth · RLS · 내 글 목록")
draw_box(7.8, row_y, 3.2, 0.7, "W3  AI 글쓰기", C_DONE_BG, C_DONE,
         bold=True, status_dot=C_DONE, subtext="Vision → 초안 → 저장 · 복사")
draw_box(11.3, row_y, 3.2, 0.7, "W4  보안 + 마무리", C_DONE_BG, C_DONE,
         bold=True, status_dot=C_DONE, subtext="재생성 · 코드리뷰 7건 · 3티어")

draw_arrow(4.0, row_y + 0.35, 4.3, row_y + 0.35)
draw_arrow(7.5, row_y + 0.35, 7.8, row_y + 0.35)
draw_arrow(11.0, row_y + 0.35, 11.3, row_y + 0.35)

# ── Row 2: 페르소나 + 봇 + 보안/UX ──
row_y2 = 24.2
draw_box(0.8, row_y2, 3.5, 0.7, "W5  페르소나 학습", C_DONE_BG, C_DONE,
         bold=True, status_dot=C_DONE, subtext="크롤링 → AI 2-pass → HTML 렌더러")
draw_box(4.6, row_y2, 3.5, 0.7, "W6  댓글 봇 웹 통합", C_DONE_BG, C_DONE,
         bold=True, status_dot=C_DONE, subtext="Supabase 제어 평면 · 이중 제어")
draw_box(8.4, row_y2, 3.2, 0.7, "보안 3건", C_DONE_BG, C_DONE,
         bold=True, status_dot=C_DONE, subtext="쿠키 업로드 · 배치 · cred 삭제")
draw_box(11.9, row_y2, 2.6, 0.7, "UX 5건", C_DONE_BG, C_DONE,
         bold=True, status_dot=C_DONE, subtext="이탈경고 · 불러오기 · 압축")

# ── Row 3: P3 확장 기능 4건 ──
row_y3 = 23.0
ax.text(1.0, row_y3 + 0.85, "P3 확장 기능", fontsize=11,
        color="#D2A8FF", fontweight="bold")

draw_box(0.8, row_y3, 3.2, 0.65, "다중 페르소나", C_DONE_BG, C_DONE,
         bold=True, status_dot=C_DONE, subtext="1:N · 기본 지정 · 글쓰기 선택")
draw_box(4.3, row_y3, 3.2, 0.65, "콘텐츠 캘린더", C_DONE_BG, C_DONE,
         bold=True, status_dot=C_DONE, subtext="월별 그리드 · CRUD · write 연동")
draw_box(7.8, row_y3, 3.2, 0.65, "성과 분석", C_DONE_BG, C_DONE,
         bold=True, status_dot=C_DONE, subtext="recharts · 크롤링 · 시계열 DB")
draw_box(11.3, row_y3, 3.2, 0.65, "OAuth 로그인", C_DONE_BG, C_DONE,
         bold=True, status_dot=C_DONE, subtext="카카오 · 네이버 · 계정 연결")

# ── Row 4: 기타 완료 ──
row_y4 = 21.9
draw_box(0.8, row_y4, 2.5, 0.65, "관리자 페이지", C_DONE_BG, C_DONE,
         bold=True, status_dot=C_DONE, subtext="사용자 · 티어/상태 변경")
draw_box(3.6, row_y4, 2.5, 0.65, "글 히스토리", C_DONE_BG, C_DONE,
         bold=True, status_dot=C_DONE, subtext="버전 JSONB · 전환 UI")
draw_box(6.4, row_y4, 2.5, 0.65, "글 삭제/편집", C_DONE_BG, C_DONE,
         bold=True, status_dot=C_DONE, subtext="PATCH/DELETE · Storage 정리")
draw_box(9.2, row_y4, 2.6, 0.65, "사진 순서 변경", C_DONE_BG, C_DONE,
         bold=True, status_dot=C_DONE, subtext="HTML5 DnD · 네이티브")
draw_box(12.1, row_y4, 2.6, 0.65, "이미지 압축", C_DONE_BG, C_DONE,
         bold=True, status_dot=C_DONE, subtext="1920px · JPEG 0.8")

# ── 구분선 ──
ax.plot([0.8, 21.2], [21.5, 21.5], color=C_BORDER, linewidth=1, linestyle=":")

# ── Row 5: 해야 할 일 (P1) ──
row_y5 = 20.5
ax.text(1.0, row_y5 + 0.65, "P1  사용자 확장 전 필수  (다음 단계)",
        fontsize=11, color="#FF7B72", fontweight="bold")

draw_box(0.8, row_y5 - 0.5, 4.8, 0.9, "Vercel 프로덕션 배포", C_TODO_BG, C_TODO,
         bold=True, status_dot=C_TODO, fontsize=11,
         subtext="환경변수 설정 · 커스텀 도메인 · HTTPS")
draw_box(5.9, row_y5 - 0.5, 4.8, 0.9, "모바일 반응형", C_TODO_BG, C_TODO,
         bold=True, status_dot=C_TODO, fontsize=11,
         subtext="write 페이지 핵심 — 블로거 대다수 모바일")
draw_box(11.0, row_y5 - 0.5, 4.8, 0.9, "신규 온보딩 플로우", C_TODO_BG, C_TODO,
         bold=True, status_dot=C_TODO, fontsize=11,
         subtext="가입 → 블로그URL → 크롤링 → 첫 글 자동 유도")

# ── Row 6: 해야 할 일 (P1 하단 + P2) ──
row_y6 = 18.8
draw_box(0.8, row_y6, 4.8, 0.9, "랜딩 페이지", C_TODO_BG, C_TODO,
         bold=True, status_dot=C_TODO, fontsize=11,
         subtext="서비스 소개 · 사용 예시 · 가입 유도")

ax.text(6.1, row_y6 + 0.9, "P2  사용성 개선",
        fontsize=10, color=C_PARTIAL, fontweight="bold")
draw_box(5.9, row_y6, 4.8, 0.9, "카테고리별 프롬프트 커스텀", C_TODO_BG, C_TODO,
         bold=True, status_dot=C_TODO, fontsize=11,
         subtext="맛집/카페/여행마다 다른 AI 지시")

# ── 수동 작업 (사용자 필요) ──
row_y7 = 17.1
ax.text(1.0, row_y7 + 1.15, "수동 작업  (사용자가 직접 처리)",
        fontsize=10, color="#FFA657", fontweight="bold")

draw_box(0.8, row_y7, 3.6, 0.85, "SQL 마이그레이션 4건", C_TODO_BG, C_TODO,
         bold=True, status_dot=C_TODO, fontsize=10,
         subtext="00012~00015 Supabase SQL Editor")
draw_box(4.7, row_y7, 3.6, 0.85, "OAuth 앱 등록", C_TODO_BG, C_TODO,
         bold=True, status_dot=C_TODO, fontsize=10,
         subtext="카카오/네이버 개발자 콘솔")
draw_box(8.6, row_y7, 3.6, 0.85, "환경변수 등록", C_TODO_BG, C_TODO,
         bold=True, status_dot=C_TODO, fontsize=10,
         subtext="KAKAO/NAVER _CLIENT_ID/SECRET")
draw_box(12.5, row_y7, 3.3, 0.85, "recharts 패키지 확인", C_PARTIAL_BG, C_PARTIAL,
         bold=True, status_dot=C_PARTIAL, fontsize=10,
         subtext="package.json 의존성 확인")

# ── 완료율 표시 ──
row_y8 = 15.0
ax.text(1.0, row_y8 + 1.2, "완료율", fontsize=12, color=C_TEXT, fontweight="bold")

# 프로그레스 바
total = 30
done = 25
pct = done / total

bar_x, bar_y, bar_w, bar_h = 1.0, row_y8 + 0.3, 14.5, 0.5
# 배경
bg_bar = FancyBboxPatch((bar_x, bar_y), bar_w, bar_h,
                         boxstyle="round,pad=0,rounding_size=0.06",
                         facecolor="#21262D", edgecolor=C_BORDER, linewidth=1)
ax.add_patch(bg_bar)
# 채워진 부분
fill_bar = FancyBboxPatch((bar_x, bar_y), bar_w * pct, bar_h,
                           boxstyle="round,pad=0,rounding_size=0.06",
                           facecolor=C_DONE, edgecolor="none", linewidth=0)
ax.add_patch(fill_bar)
ax.text(bar_x + bar_w * pct / 2, bar_y + bar_h / 2,
        f"{done}/{total} 기능 완료  ({pct:.0%})", fontsize=11,
        color="white", fontweight="bold", ha="center", va="center", zorder=5)

ax.text(bar_x + bar_w + 0.3, bar_y + bar_h / 2,
        f"미완료 {total - done}건", fontsize=10,
        color=C_TODO, fontweight="bold", va="center")


# ═══════════════════════════════════════════
# SECTION 2: 로컬 봇 시스템
# ═══════════════════════════════════════════
draw_section(0.3, 7.0, 21.4, 7.0, "로컬 봇 시스템  (Python + Playwright + SQLite)")

# ── Phase 1 ──
bot_y1 = 12.7
draw_box(0.8, bot_y1, 4.8, 0.7, "Phase 1  댓글 봇", C_DONE_BG, C_DONE,
         bold=True, status_dot=C_DONE, subtext="수집 · AI 댓글 · 작성 · 중복방지")
draw_box(5.9, bot_y1, 4.8, 0.7, "Phase 4  피드백 루프", C_DONE_BG, C_DONE,
         bold=True, status_dot=C_DONE, subtext="스타일 자동 갱신 · API 연동")
draw_box(11.0, bot_y1, 4.8, 0.7, "댓글 봇 개선", C_DONE_BG, C_DONE,
         bold=True, status_dot=C_DONE, subtext="톤 변형 · 딜레이 랜덤화 · 서킷 브레이커")

# ── Phase 2 ──
bot_y2 = 11.5
draw_box(0.8, bot_y2, 4.8, 0.7, "Phase 2  게시물 발행", C_PARTIAL_BG, C_PARTIAL,
         bold=True, status_dot=C_PARTIAL,
         subtext="AI 콘텐츠 생성 완료 / 셀렉터 변경으로 발행 차단")
draw_box(5.9, bot_y2, 4.8, 0.7, "Phase 3  n8n + Telegram", C_PARTIAL_BG, C_PARTIAL,
         bold=True, status_dot=C_PARTIAL,
         subtext="API 서버 + 봇 완료 / /execute 개발 중")

# ── 보류 사유 ──
bot_y3 = 10.4
ax.text(1.0, bot_y3 + 0.65, "보류/제거 항목", fontsize=10, color=C_SUBTEXT, fontweight="bold")
draw_box(0.8, bot_y3 - 0.2, 5.0, 0.65, "스마트에디터 셀렉터 — 제거", C_SECTION_BG, C_BORDER,
         status_dot=C_SUBTEXT, subtext="자동 발행 안 함 → 웹 플랫폼으로 전환")
draw_box(6.0, bot_y3 - 0.2, 5.0, 0.65, "publisher_main.py — 제거", C_SECTION_BG, C_BORDER,
         status_dot=C_SUBTEXT, subtext="사용자가 직접 게시 (웹 복사 → 붙여넣기)")

# ── 서비스 상태 ──
bot_y4 = 8.7
ax.text(1.0, bot_y4 + 0.85, "서비스 실행 상태", fontsize=10, color="#79C0FF", fontweight="bold")
draw_box(0.8, bot_y4, 3.0, 0.65, "댓글 봇 Cron", C_DONE_BG, C_DONE,
         status_dot=C_DONE, subtext="평일 20:30 · 주말 13:30")
draw_box(4.0, bot_y4, 3.0, 0.65, "텔레그램 봇", C_DONE_BG, C_DONE,
         status_dot=C_DONE, subtext="tmux blog:telegram")
draw_box(7.2, bot_y4, 3.0, 0.65, "API 서버", C_DONE_BG, C_DONE,
         status_dot=C_DONE, subtext="tmux blog:api :8001")
draw_box(10.4, bot_y4, 3.0, 0.65, "웹 /bot 대시보드", C_DONE_BG, C_DONE,
         status_dot=C_DONE, subtext="상태 · 승인 · 설정")

# ── 연결 화살표 (로컬 ↔ Supabase ↔ 웹) ──
ax.annotate("Supabase\n제어 평면", xy=(8.0, 7.6), fontsize=9, color="#79C0FF",
            ha="center", fontweight="bold")
draw_arrow(5.5, 7.7, 6.8, 7.7, color="#79C0FF")
draw_arrow(9.2, 7.7, 10.0, 7.7, color="#79C0FF")
ax.text(4.5, 7.7, "로컬 봇", fontsize=8, color=C_SUBTEXT, ha="center", va="center")
ax.text(11.0, 7.7, "웹 UI", fontsize=8, color=C_SUBTEXT, ha="center", va="center")


# ═══════════════════════════════════════════
# SECTION 3: 기술 스택
# ═══════════════════════════════════════════
draw_section(0.3, 0.3, 21.4, 6.3, "기술 스택 + 아키텍처")

# ── 웹 플랫폼 스택 ──
stack_y = 5.3
ax.text(1.0, stack_y + 0.75, "웹 플랫폼", fontsize=10, color="#79C0FF", fontweight="bold")

stacks = [
    ("Next.js 14", "프론트 + API Routes"),
    ("Supabase", "Auth · DB · Storage · RLS"),
    ("Vercel", "배포 (미설정)"),
    ("Anthropic SDK", "Vision + Sonnet + Haiku"),
    ("recharts", "성과 분석 차트"),
    ("cheerio", "네이버 블로그 크롤링"),
]
for i, (name, desc) in enumerate(stacks):
    col = i % 6
    draw_box(0.8 + col * 3.3, stack_y, 3.0, 0.55, name, "#1C2128", C_BORDER,
             fontsize=9, bold=True, subtext=desc)

# ── 로컬 봇 스택 ──
stack_y2 = 4.0
ax.text(1.0, stack_y2 + 0.75, "로컬 봇", fontsize=10, color="#79C0FF", fontweight="bold")

stacks2 = [
    ("Python 3.12", "async/await · type hints"),
    ("Playwright", "브라우저 자동화"),
    ("SQLite + WAL", "운영 데이터 (로컬)"),
    ("FastAPI", "웹훅 서버 :8001"),
    ("Claude API", "Haiku 댓글 · Sonnet Vision"),
    ("Cron", "스케줄러 (평일/주말)"),
]
for i, (name, desc) in enumerate(stacks2):
    col = i % 6
    draw_box(0.8 + col * 3.3, stack_y2, 3.0, 0.55, name, "#1C2128", C_BORDER,
             fontsize=9, bold=True, subtext=desc)

# ── DB 테이블 현황 ──
stack_y3 = 2.6
ax.text(1.0, stack_y3 + 0.8, "Supabase 테이블 (마이그레이션 15건)",
        fontsize=10, color="#79C0FF", fontweight="bold")

tables = [
    ("users", True), ("generation_queue", True), ("user_personas", True),
    ("persona_items", True), ("persona_feedback", True), ("pending_comments", True),
    ("bot_settings", True), ("bot_run_log", True), ("content_calendar", False),
    ("post_analytics", False), ("user_post_stats (view)", False),
]
for i, (tbl, done) in enumerate(tables):
    col = i % 6
    row = i // 6
    color = C_DONE if done else C_PARTIAL
    bg = C_DONE_BG if done else C_PARTIAL_BG
    draw_box(0.8 + col * 3.3, stack_y3 - row * 0.55, 3.0, 0.45,
             tbl, bg, color, fontsize=8, status_dot=color)

# ── 비용 정보 ──
ax.text(16.5, 5.5, "월 비용 (예상)", fontsize=10, color="#FFA657", fontweight="bold", ha="center")
costs = [
    ("AI 댓글 (Haiku)", "~$0.11/월"),
    ("AI 초안 (Haiku)", "~$0.01/건"),
    ("페르소나 분석 (Sonnet)", "~$0.05/회"),
    ("Supabase", "무료"),
    ("Vercel", "무료"),
]
for i, (item, cost) in enumerate(costs):
    ax.text(15.6, 5.0 - i * 0.35, item, fontsize=8, color=C_SUBTEXT)
    ax.text(19.8, 5.0 - i * 0.35, cost, fontsize=8, color=C_TEXT, fontweight="bold", ha="right")

# ── 우측 사이드바: 요약 카드 ──
draw_box(16.0, 22.8, 5.2, 3.5, "", "#0D1117", C_HEADER, radius=0.05)
ax.text(18.6, 26.0, "요약", fontsize=13, color=C_HEADER, fontweight="bold", ha="center")
ax.plot([16.3, 20.9], [25.7, 25.7], color=C_BORDER, linewidth=1)

summary = [
    ("웹 플랫폼 주차", "W1~W6 + P3  전체 완료"),
    ("코드 완성", "25/30 기능 구현"),
    ("DB 마이그레이션", "15건 (4건 미실행)"),
    ("코드 리뷰", "6회 완료"),
    ("보안 수정", "Critical 4 / High 5 / Medium 8"),
    ("남은 핵심 작업", "배포 · 모바일 · 온보딩 · 랜딩"),
]
for i, (k, v) in enumerate(summary):
    ax.text(16.5, 25.3 - i * 0.45, k, fontsize=8.5, color=C_SUBTEXT)
    ax.text(20.8, 25.3 - i * 0.45, v, fontsize=8.5, color=C_TEXT,
            fontweight="bold", ha="right")

# ── 우측 사이드바: 다음 단계 ──
draw_box(16.0, 19.8, 5.2, 2.6, "", "#0D1117", C_TODO, radius=0.05)
ax.text(18.6, 22.15, "NEXT STEPS", fontsize=12, color=C_TODO, fontweight="bold", ha="center")
ax.plot([16.3, 20.9], [21.85, 21.85], color=C_BORDER, linewidth=1)

nexts = [
    ("1.", "SQL 마이그레이션 4건 실행"),
    ("2.", "카카오/네이버 OAuth 앱 등록"),
    ("3.", "환경변수 등록 (.env.local)"),
    ("4.", "Vercel 프로덕션 배포"),
    ("5.", "모바일 반응형 (write 핵심)"),
    ("6.", "온보딩 + 랜딩 페이지"),
]
for i, (num, item) in enumerate(nexts):
    ax.text(16.5, 21.5 - i * 0.35, num, fontsize=9, color=C_TODO, fontweight="bold")
    ax.text(17.0, 21.5 - i * 0.35, item, fontsize=9, color=C_TEXT)

plt.tight_layout(pad=0.5)
plt.savefig("/home/gint_pcd/projects/인성이프로젝트/docs/프로젝트/block_diagram.png",
            dpi=150, facecolor="#0D1117", bbox_inches="tight")
print("✅ 저장: docs/프로젝트/block_diagram.png")
