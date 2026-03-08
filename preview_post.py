"""
사진 + 메모 → AI 초안 생성 → HTML 프리뷰

사용법:
  source .venv/bin/activate
  python preview_post.py photo1.jpg photo2.jpg --memo "강남 파스타 맛집"
  python preview_post.py photo1.jpg              # 메모 없이
  python preview_post.py photo1.jpg --open       # 생성 후 브라우저로 열기

출력:
  output/preview_YYYYMMDD_HHMMSS.html
"""
import argparse
import asyncio
import os
import sys
import webbrowser
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from dotenv import load_dotenv

load_dotenv()

from src.utils.logger import logger
from src.utils.photo_marker import render_html_segments


def _to_html(title: str, body: str, hashtags: list[str], category: str | None,
             image_paths: list[str]) -> str:
    """생성된 콘텐츠를 네이버 블로그 스타일 HTML로 변환"""
    # 사진+본문 교차 렌더링 (마커 없으면 사진 상단 폴백)
    content_html = render_html_segments(body, image_paths)

    # 해시태그
    tags_html = " ".join(f'<span class="tag">#{tag}</span>' for tag in hashtags)

    return f"""\
<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{title}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Nanum+Gothic&display=swap');
  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  body {{
    font-family: 'NanumBarunHipi', 'Nanum Gothic', '나눔고딕', sans-serif;
    font-size: 16px;
    line-height: 1.8;
    color: #333;
    background: #f5f5f5;
    padding: 20px;
  }}
  .container {{
    max-width: 700px;
    margin: 0 auto;
    background: #fff;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    overflow: hidden;
  }}
  .header {{
    background: #03c75a;
    color: #fff;
    padding: 12px 20px;
    font-size: 13px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }}
  .header .blog-name {{ font-weight: bold; }}
  .header .category {{ opacity: 0.9; }}
  .title {{
    font-size: 22px;
    font-weight: bold;
    padding: 24px 24px 8px;
    color: #222;
    line-height: 1.4;
  }}
  .meta {{
    padding: 0 24px 16px;
    font-size: 12px;
    color: #999;
    border-bottom: 1px solid #eee;
  }}
  .body {{
    padding: 24px;
  }}
  .body p {{
    margin-bottom: 12px;
  }}
  .photo {{
    margin: 16px 0;
    text-align: center;
  }}
  .photo img {{
    max-width: 100%;
    border-radius: 4px;
    border: 1px solid #eee;
  }}
  .tags {{
    padding: 16px 24px;
    border-top: 1px solid #eee;
  }}
  .tag {{
    display: inline-block;
    background: #f0f7f0;
    color: #03c75a;
    padding: 4px 10px;
    margin: 3px;
    border-radius: 20px;
    font-size: 13px;
  }}
  .footer {{
    padding: 12px 24px;
    background: #fafafa;
    border-top: 1px solid #eee;
    font-size: 11px;
    color: #aaa;
    text-align: center;
  }}
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <span class="blog-name">유유베어 블로그</span>
    <span class="category">{category or '미분류'}</span>
  </div>
  <div class="title">{title}</div>
  <div class="meta">{datetime.now().strftime('%Y. %m. %d. %H:%M')} | AI 초안 프리뷰</div>

  <div class="body">
    {content_html}
  </div>

  <div class="tags">
    {tags_html}
  </div>

  <div class="footer">
    이 글은 AI가 생성한 초안입니다. 수정 후 발행하세요.
  </div>
</div>
</body>
</html>"""


def main():
    parser = argparse.ArgumentParser(description="사진 → AI 초안 → HTML 프리뷰")
    parser.add_argument("photos", nargs="+", help="사진 파일 경로 (1~10장)")
    parser.add_argument("--memo", default="", help="메모 (장소명, 한줄 감상 등)")
    parser.add_argument("--open", action="store_true", dest="open_browser",
                        help="생성 후 브라우저로 열기")
    args = parser.parse_args()

    # 이미지 경로 확인
    valid = [p for p in args.photos if Path(p).exists()]
    if not valid:
        print("오류: 유효한 사진 파일이 없습니다.")
        for p in args.photos:
            if not Path(p).exists():
                print(f"  - 없는 파일: {p}")
        sys.exit(1)

    missing = [p for p in args.photos if not Path(p).exists()]
    if missing:
        print(f"경고: {len(missing)}개 파일 없음 — 건너뜀")

    print(f"사진 {len(valid)}장으로 AI 초안 생성 중...")
    if args.memo:
        print(f"메모: {args.memo}")
    print()

    # AI 생성
    from src.ai.content_generator import generate_post

    try:
        result = generate_post(valid, args.memo)
    except Exception as e:
        print(f"오류: {e}")
        sys.exit(1)

    title = result["title"]
    body = result["body"]
    hashtags = result["hashtags"]
    category = result.get("category")

    # 터미널 프리뷰
    print(f"카테고리: [{category}]")
    print(f"제목: {title}")
    print(f"본문: {len(body)}자")
    print(f"해시태그: {len(hashtags)}개")
    print()

    # HTML 생성
    html = _to_html(title, body, hashtags, category, valid)

    output_dir = Path("output")
    output_dir.mkdir(exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_path = output_dir / f"preview_{timestamp}.html"
    output_path.write_text(html, encoding="utf-8")

    print(f"HTML 저장: {output_path}")

    # WSL에서 브라우저 열기
    if args.open_browser:
        # WSL → Windows 경로 변환
        try:
            wsl_path = str(output_path.resolve())
            os.system(f'explorer.exe "$(wslpath -w {wsl_path})" 2>/dev/null || xdg-open {wsl_path}')
        except Exception:
            print(f"브라우저 열기 실패. 수동으로 열어주세요: {output_path.resolve()}")
    else:
        abs_path = output_path.resolve()
        print(f"\n브라우저로 열기:")
        print(f"  explorer.exe \"$(wslpath -w {abs_path})\"")


if __name__ == "__main__":
    main()
