"""
SQLite 데이터베이스 레이어
- comment_history: 댓글 이력 (post_url UNIQUE)
- blogger_visit_log: 일별 방문 한도 체크
- run_log: 실행 통계
- post_history: 게시물 발행 이력 (Phase 2)
"""
import json
import sqlite3
from contextlib import contextmanager
from pathlib import Path

from config.settings import DB_PATH


def init_db() -> None:
    """DB 파일 및 테이블 초기화 (최초 1회)"""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with _conn() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS comment_history (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                post_url     TEXT NOT NULL UNIQUE,
                blog_id      TEXT NOT NULL,
                post_title   TEXT NOT NULL DEFAULT '',
                comment_text TEXT NOT NULL DEFAULT '',
                success      INTEGER NOT NULL DEFAULT 0,
                created_at   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
            );

            CREATE TABLE IF NOT EXISTS blogger_visit_log (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                blog_id    TEXT NOT NULL,
                visit_date TEXT NOT NULL DEFAULT (date('now','localtime')),
                UNIQUE(blog_id, visit_date)
            );

            CREATE TABLE IF NOT EXISTS run_log (
                id               INTEGER PRIMARY KEY AUTOINCREMENT,
                run_at           TEXT NOT NULL DEFAULT (datetime('now','localtime')),
                bloggers_visited INTEGER NOT NULL DEFAULT 0,
                comments_written INTEGER NOT NULL DEFAULT 0,
                comments_failed  INTEGER NOT NULL DEFAULT 0,
                error_message    TEXT DEFAULT NULL
            );

            CREATE TABLE IF NOT EXISTS post_history (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                title       TEXT NOT NULL,
                body        TEXT NOT NULL,
                hashtags    TEXT NOT NULL DEFAULT '[]',
                image_paths TEXT NOT NULL DEFAULT '[]',
                post_url    TEXT DEFAULT NULL,
                status      TEXT NOT NULL DEFAULT 'draft',
                created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
            );
        """)


@contextmanager
def _conn():
    """컨텍스트 매니저로 커넥션 자동 관리"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


# ── comment_history ──────────────────────────────────────────────────────────

def is_post_commented(post_url: str) -> bool:
    """해당 URL에 이미 성공한 댓글이 있는지 확인.
    실패(success=0) 기록은 재시도 허용을 위해 무시."""
    with _conn() as conn:
        row = conn.execute(
            "SELECT 1 FROM comment_history WHERE post_url = ? AND success = 1",
            (post_url,),
        ).fetchone()
    return row is not None


def record_comment(
    post_url: str,
    blog_id: str,
    post_title: str,
    comment_text: str,
    success: bool,
) -> None:
    """댓글 이력 저장 (이미 있으면 무시)"""
    with _conn() as conn:
        conn.execute(
            """
            INSERT OR IGNORE INTO comment_history
                (post_url, blog_id, post_title, comment_text, success)
            VALUES (?, ?, ?, ?, ?)
            """,
            (post_url, blog_id, post_title, comment_text, int(success)),
        )


def count_today_comments() -> int:
    """오늘 성공한 댓글 수 반환"""
    with _conn() as conn:
        row = conn.execute(
            """
            SELECT COUNT(*) as cnt FROM comment_history
            WHERE success = 1
              AND date(created_at) = date('now','localtime')
            """
        ).fetchone()
    return row["cnt"] if row else 0


# ── blogger_visit_log ─────────────────────────────────────────────────────────

def count_today_bloggers() -> int:
    """오늘 방문한 블로거 수 반환"""
    with _conn() as conn:
        row = conn.execute(
            """
            SELECT COUNT(*) as cnt FROM blogger_visit_log
            WHERE visit_date = date('now','localtime')
            """
        ).fetchone()
    return row["cnt"] if row else 0


def is_blogger_visited_today(blog_id: str) -> bool:
    """오늘 이미 방문한 블로거인지 확인"""
    with _conn() as conn:
        row = conn.execute(
            """
            SELECT 1 FROM blogger_visit_log
            WHERE blog_id = ? AND visit_date = date('now','localtime')
            """,
            (blog_id,),
        ).fetchone()
    return row is not None


def mark_blogger_visited(blog_id: str) -> None:
    """오늘 방문 기록 추가 (중복 무시)"""
    with _conn() as conn:
        conn.execute(
            "INSERT OR IGNORE INTO blogger_visit_log (blog_id) VALUES (?)",
            (blog_id,),
        )


# ── run_log ───────────────────────────────────────────────────────────────────

def record_run(
    bloggers_visited: int,
    comments_written: int,
    comments_failed: int,
    error_message: str | None = None,
) -> None:
    """실행 통계 저장"""
    with _conn() as conn:
        conn.execute(
            """
            INSERT INTO run_log
                (bloggers_visited, comments_written, comments_failed, error_message)
            VALUES (?, ?, ?, ?)
            """,
            (bloggers_visited, comments_written, comments_failed, error_message),
        )


# ── post_history ──────────────────────────────────────────────────────────

def record_post(
    title: str,
    body: str,
    hashtags: list[str],
    image_paths: list[str],
    status: str = "draft",
) -> int:
    """게시물 이력 저장. 생성된 row id 반환."""
    with _conn() as conn:
        cursor = conn.execute(
            """
            INSERT INTO post_history (title, body, hashtags, image_paths, status)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                title,
                body,
                json.dumps(hashtags, ensure_ascii=False),
                json.dumps(image_paths, ensure_ascii=False),
                status,
            ),
        )
    return cursor.lastrowid


def update_post_status(
    post_id: int,
    status: str,
    post_url: str | None = None,
) -> None:
    """게시물 상태 업데이트. 발행 후 URL도 함께 저장."""
    with _conn() as conn:
        if post_url:
            conn.execute(
                "UPDATE post_history SET status = ?, post_url = ? WHERE id = ?",
                (status, post_url, post_id),
            )
        else:
            conn.execute(
                "UPDATE post_history SET status = ? WHERE id = ?",
                (status, post_id),
            )
