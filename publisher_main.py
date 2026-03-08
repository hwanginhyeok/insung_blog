"""
게시물 자동 발행 CLI

사용법:
  python publisher_main.py --photos img1.jpg img2.jpg --memo "강남 파스타 맛집"
  python publisher_main.py --photos img1.jpg --dry-run
  python publisher_main.py --no-ai --title "제목" --body "본문" --photos img1.jpg

흐름:
  1. 사진 + 메모 → AI 콘텐츠 생성 (또는 --no-ai로 수동 입력)
  2. 터미널에서 제목/본문/해시태그 프리뷰
  3. 사용자 승인 (y/N)
  4. 네이버 스마트에디터로 자동 발행
"""
import argparse
import asyncio
import os
import sys
from pathlib import Path

# 프로젝트 루트를 sys.path에 추가 (패키지 import 해결)
sys.path.insert(0, str(Path(__file__).parent))

from dotenv import load_dotenv

load_dotenv()

from src.storage.database import init_db, record_post, update_post_status
from src.utils.logger import get_publisher_logger

logger = get_publisher_logger()


def _preview_post(
    title: str, body: str, hashtags: list[str], category: str | None = None
) -> None:
    """터미널에 게시물 프리뷰 출력"""
    print("\n" + "=" * 60)
    print("게시물 프리뷰")
    if category:
        print(f"카테고리: [{category}]")
    print("=" * 60)
    print(f"\n제목: {title}")
    print(f"\n{'─' * 60}")
    print(body)
    print(f"{'─' * 60}")
    if hashtags:
        tags_str = " ".join(f"#{tag}" for tag in hashtags)
        print(f"\n해시태그 ({len(hashtags)}개):\n{tags_str}")
    print("=" * 60)


def _confirm(prompt: str = "발행하시겠습니까? (y/N): ") -> bool:
    """사용자 확인 프롬프트"""
    answer = input(prompt).strip().lower()
    return answer in ("y", "yes")


async def _run_publish(
    title: str,
    body: str,
    hashtags: list[str],
    image_paths: list[str],
    dry_run: bool,
    category: str | None = None,
) -> None:
    """Playwright로 실제 발행 수행"""
    from playwright.async_api import async_playwright

    from src.auth.naver_login import ensure_login
    from src.publisher.blog_publisher import publish_post
    from src.utils.browser import create_browser

    naver_id = os.environ.get("NAVER_ID", "")
    naver_pw = os.environ.get("NAVER_PW", "")
    blog_id = os.environ.get("MY_BLOG_ID", "")

    if not all([naver_id, naver_pw, blog_id]):
        logger.error(".env에 NAVER_ID, NAVER_PW, MY_BLOG_ID가 필요합니다")
        return

    # DB에 초안 저장
    post_id = record_post(
        title, body, hashtags, image_paths, status="draft", category=category,
    )
    logger.info(f"초안 저장 (ID: {post_id})")

    async with async_playwright() as pw:
        browser, context, page = await create_browser(pw, headless=False)

        try:
            # 로그인
            logged_in = await ensure_login(context, page, naver_id, naver_pw)
            if not logged_in:
                logger.error("로그인 실패 — 발행 중단")
                update_post_status(post_id, "failed")
                return

            # 발행
            post_url = await publish_post(
                page=page,
                blog_id=blog_id,
                title=title,
                body=body,
                image_paths=image_paths,
                hashtags=hashtags,
                dry_run=dry_run,
            )

            if post_url:
                status = "dry-run" if dry_run else "published"
                update_post_status(post_id, status, post_url if not dry_run else None)
                if dry_run:
                    logger.info("[dry-run] 발행 시뮬레이션 완료")
                else:
                    logger.info(f"발행 완료: {post_url}")
                    print(f"\n게시물 URL: {post_url}")
            else:
                update_post_status(post_id, "failed")
                logger.error("발행 실패")

        except Exception as e:
            update_post_status(post_id, "failed")
            logger.error(f"발행 오류: {e}", exc_info=True)
        finally:
            await browser.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="네이버 블로그 게시물 자동 발행")
    parser.add_argument(
        "--photos",
        nargs="+",
        required=True,
        help="업로드할 사진 파일 경로 (1~10장)",
    )
    parser.add_argument(
        "--memo",
        default="",
        help="AI에게 전달할 메모 (장소명, 한줄 감상 등)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="발행 버튼 클릭 없이 시뮬레이션",
    )
    parser.add_argument(
        "--no-ai",
        action="store_true",
        help="AI 생성 건너뛰기 (--title, --body 필수)",
    )
    parser.add_argument(
        "--title",
        default="",
        help="직접 지정할 제목 (--no-ai 모드)",
    )
    parser.add_argument(
        "--body",
        default="",
        help="직접 지정할 본문 (--no-ai 모드)",
    )
    parser.add_argument(
        "--hashtags",
        nargs="*",
        default=[],
        help="직접 지정할 해시태그 (--no-ai 모드)",
    )
    args = parser.parse_args()

    init_db()

    # 이미지 경로 존재 확인
    valid_photos = [p for p in args.photos if Path(p).exists()]
    if not valid_photos:
        print("오류: 유효한 사진 파일이 없습니다.")
        sys.exit(1)

    category = None

    if args.no_ai:
        # 수동 모드
        if not args.title or not args.body:
            print("오류: --no-ai 모드에서는 --title과 --body가 필수입니다.")
            sys.exit(1)
        title = args.title
        body = args.body
        hashtags = args.hashtags or []
    else:
        # AI 모드
        try:
            from src.ai.content_generator import generate_post
        except ImportError as e:
            print(f"오류: AI 모듈 로드 실패 — {e}")
            sys.exit(1)

        logger.info(f"AI 콘텐츠 생성 시작 — 사진 {len(valid_photos)}장")
        try:
            result = generate_post(valid_photos, args.memo)
        except ValueError as e:
            print(f"오류: {e}")
            sys.exit(1)
        except Exception as e:
            logger.error(f"AI 콘텐츠 생성 실패: {e}", exc_info=True)
            sys.exit(1)

        title = result["title"]
        body = result["body"]
        hashtags = result["hashtags"]
        category = result.get("category")

    # 프리뷰 + 확인
    _preview_post(title, body, hashtags, category)

    if not _confirm():
        print("발행 취소됨.")
        return

    # 발행 실행
    asyncio.run(_run_publish(title, body, hashtags, valid_photos, args.dry_run, category))


if __name__ == "__main__":
    main()
