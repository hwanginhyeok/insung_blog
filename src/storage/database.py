"""
SQLite 데이터베이스 레이어 — 봇 운영 데이터 전용

테이블:
- comment_history: 댓글 이력 (post_url UNIQUE, 중복 체크용)
- blogger_visit_log: 일별 방문 한도 체크
- run_log: 실행 통계
- post_history: 게시물 발행 이력 (Phase 2)
- retry_queue: 재시도 대기 큐
- blogger_behavior: 오토 블로거 패턴 추적

제어 평면(승인 대기, 봇 설정, 실행 이력)은 Supabase로 이관됨.
→ supabase_client.py 참조

동시성 제어: WAL 모드 + 재시도 로직

다중 사용자: user_id별 DB 파일 분리 (data/{user_id[:8]}/comments.db)
user_id=None이면 기존 단일 DB (data/comments.db) 폴백
"""
import json
import sqlite3
import time
from contextlib import contextmanager
from functools import wraps
from pathlib import Path
from typing import Callable, TypeVar

from config.settings import DB_PATH, get_db_path
from src.utils.logger import logger

T = TypeVar("T")


def _resolve_db_path(user_id: str | None) -> Path:
    """user_id로 DB 경로 결정. None이면 기존 단일 DB 폴백."""
    if user_id:
        return get_db_path(user_id)
    return DB_PATH


def _retry_on_db_lock(max_retries: int = 3, delay: float = 0.5) -> Callable:
    """DB 잠금(Locked) 발생 시 재시도하는 데코레이터"""
    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        @wraps(func)
        def wrapper(*args, **kwargs) -> T:
            for attempt in range(max_retries):
                try:
                    return func(*args, **kwargs)
                except sqlite3.OperationalError as e:
                    if "database is locked" in str(e).lower() and attempt < max_retries - 1:
                        logger.warning(f"DB 잠금 감지, 재시도 ({attempt + 1}/{max_retries}): {func.__name__}")
                        time.sleep(delay * (attempt + 1))  # 지수 백오프
                        continue
                    raise
            return func(*args, **kwargs)  # 마지막 시도
        return wrapper
    return decorator


def init_db(user_id: str | None = None) -> None:
    """DB 파일 및 테이블 초기화 (최초 1회)"""
    db_path = _resolve_db_path(user_id)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    with _conn(user_id) as conn:
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
                category    TEXT DEFAULT NULL,
                created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
            );

            -- 재시도 큐 (실패한 댓글 저장)
            CREATE TABLE IF NOT EXISTS retry_queue (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                blog_id     TEXT NOT NULL,
                post_url    TEXT NOT NULL UNIQUE,
                post_title  TEXT NOT NULL DEFAULT '',
                fail_count  INTEGER NOT NULL DEFAULT 0,
                fail_reason TEXT DEFAULT NULL,
                should_retry INTEGER NOT NULL DEFAULT 0,  -- 0: 미정, 1: 예, 2: 아니오
                last_try_at TEXT DEFAULT NULL,
                next_try_at TEXT DEFAULT NULL,
                created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
            );

            -- 오토 블로거 의심 패턴 추적
            CREATE TABLE IF NOT EXISTS blogger_behavior (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                blog_id         TEXT NOT NULL UNIQUE,
                -- 의심 지표
                fast_reply_count    INTEGER NOT NULL DEFAULT 0,  -- 1분 내 답글 횟수
                pattern_score       INTEGER NOT NULL DEFAULT 0,  -- 패턴 일치 점수 (0-100)
                daily_comment_count INTEGER NOT NULL DEFAULT 0,  -- 하루 댓글 수
                -- 통계
                total_replies       INTEGER NOT NULL DEFAULT 0,  -- 총 답글 수
                last_reply_at       TEXT DEFAULT NULL,
                first_detected_at   TEXT NOT NULL DEFAULT (datetime('now','localtime')),
                updated_at          TEXT NOT NULL DEFAULT (datetime('now','localtime'))
            );
            CREATE INDEX IF NOT EXISTS idx_behavior_score ON blogger_behavior(pattern_score);
        """)
        # 마이그레이션: 기존 DB에 category 컬럼 추가
        try:
            conn.execute("ALTER TABLE post_history ADD COLUMN category TEXT DEFAULT NULL")
        except Exception:
            pass  # 이미 컬럼이 있으면 무시


@contextmanager
def _conn(user_id: str | None = None, timeout: int = 30):
    """
    컨텍스트 매니저로 커넥션 자동 관리
    - WAL 모드 (동시 읽기/쓰기 지원)
    - 타임아웃 증가 (10초 → 30초)
    - busy_timeout 설정 (자동 재시도)
    """
    db_path = _resolve_db_path(user_id)
    conn = sqlite3.connect(db_path, timeout=timeout)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=10000")  # 10초 busy wait
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


# ── comment_history ──────────────────────────────────────────────────────────

@_retry_on_db_lock(max_retries=3)
def is_post_commented(post_url: str, user_id: str | None = None) -> bool:
    """
    해당 URL에 이미 댓글이 달렸는지 확인.
    - success=1: 이미 댓글 작성됨
    (거부 상태는 Supabase pending_comments에서 관리)
    """
    with _conn(user_id) as conn:
        row = conn.execute(
            "SELECT 1 FROM comment_history WHERE post_url = ? AND success = 1",
            (post_url,),
        ).fetchone()
    return row is not None


@_retry_on_db_lock(max_retries=3)
def record_comment(
    post_url: str,
    blog_id: str,
    post_title: str,
    comment_text: str,
    success: bool,
    user_id: str | None = None,
) -> None:
    """댓글 이력 저장. 실패→성공 재시도 시 기존 기록을 업데이트."""
    with _conn(user_id) as conn:
        existing = conn.execute(
            "SELECT id, success FROM comment_history WHERE post_url = ?",
            (post_url,),
        ).fetchone()
        if existing:
            # 기존 실패 기록이 있고 이번에 성공했으면 업데이트
            if not existing["success"] and success:
                conn.execute(
                    """UPDATE comment_history
                       SET comment_text = ?, success = 1,
                           created_at = datetime('now','localtime')
                       WHERE id = ?""",
                    (comment_text, existing["id"]),
                )
            # 이미 성공 기록이 있으면 무시
        else:
            conn.execute(
                """INSERT INTO comment_history
                    (post_url, blog_id, post_title, comment_text, success)
                   VALUES (?, ?, ?, ?, ?)""",
                (post_url, blog_id, post_title, comment_text, int(success)),
            )


@_retry_on_db_lock(max_retries=3)
def count_today_comments(user_id: str | None = None) -> int:
    """오늘 성공한 댓글 수 반환"""
    with _conn(user_id) as conn:
        row = conn.execute(
            """
            SELECT COUNT(*) as cnt FROM comment_history
            WHERE success = 1
              AND date(created_at) = date('now','localtime')
            """
        ).fetchone()
    return row["cnt"] if row else 0


def get_recent_comments_for_blogger(
    blog_id: str,
    days: int = 30,
    user_id: str | None = None,
) -> list[str]:
    """
    특정 블로거에게 최근 N일간 단 댓글 목록 반환.
    AI 댓글 중복 방지에 사용.
    """
    with _conn(user_id) as conn:
        rows = conn.execute(
            """
            SELECT comment_text FROM comment_history
            WHERE blog_id = ?
              AND success = 1
              AND date(created_at) >= date('now', '-{} days')
            ORDER BY created_at DESC
            """.format(days),
            (blog_id,),
        ).fetchall()
    return [row["comment_text"] for row in rows]


# ── blogger_visit_log ─────────────────────────────────────────────────────────

def count_today_bloggers(user_id: str | None = None) -> int:
    """오늘 방문한 블로거 수 반환"""
    with _conn(user_id) as conn:
        row = conn.execute(
            """
            SELECT COUNT(*) as cnt FROM blogger_visit_log
            WHERE visit_date = date('now','localtime')
            """
        ).fetchone()
    return row["cnt"] if row else 0


@_retry_on_db_lock(max_retries=3)
def is_blogger_visited_today(blog_id: str, user_id: str | None = None) -> bool:
    """오늘 이미 방문한 블로거인지 확인"""
    with _conn(user_id) as conn:
        row = conn.execute(
            """
            SELECT 1 FROM blogger_visit_log
            WHERE blog_id = ? AND visit_date = date('now','localtime')
            """,
            (blog_id,),
        ).fetchone()
    return row is not None


@_retry_on_db_lock(max_retries=3)
def mark_blogger_visited(blog_id: str, user_id: str | None = None) -> None:
    """오늘 방문 기록 추가 (중복 무시)"""
    with _conn(user_id) as conn:
        conn.execute(
            "INSERT OR IGNORE INTO blogger_visit_log (blog_id) VALUES (?)",
            (blog_id,),
        )


# ── run_log ───────────────────────────────────────────────────────────────────

@_retry_on_db_lock(max_retries=3)
def record_run(
    bloggers_visited: int,
    comments_written: int,
    comments_failed: int,
    error_message: str | None = None,
    user_id: str | None = None,
) -> None:
    """실행 통계 저장"""
    with _conn(user_id) as conn:
        conn.execute(
            """
            INSERT INTO run_log
                (bloggers_visited, comments_written, comments_failed, error_message)
            VALUES (?, ?, ?, ?)
            """,
            (bloggers_visited, comments_written, comments_failed, error_message),
        )


# ── 품질 모니터링 ─────────────────────────────────────────────────────────────


@_retry_on_db_lock(max_retries=3)
def get_comment_quality_stats(days: int = 7, user_id: str | None = None) -> dict:
    """
    댓글 품질 통계 조회
    - 성공률
    - 평균 길이
    - AI/phrases 사용 비율 (추정)
    """
    with _conn(user_id) as conn:
        # 성공/실패 통계
        row = conn.execute(
            """
            SELECT
                COUNT(*) as total,
                SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as success,
                SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failed
            FROM comment_history
            WHERE date(created_at) >= date('now', '-{} days')
            """.format(days)
        ).fetchone()

        # 길이 통계
        length_stats = conn.execute(
            """
            SELECT
                AVG(LENGTH(comment_text)) as avg_len,
                MIN(LENGTH(comment_text)) as min_len,
                MAX(LENGTH(comment_text)) as max_len
            FROM comment_history
            WHERE success = 1
              AND date(created_at) >= date('now', '-{} days')
            """.format(days)
        ).fetchone()

        # 품질 이상 댓글 (너무 짧거나 긴 것)
        quality_issues = conn.execute(
            """
            SELECT COUNT(*) as count
            FROM comment_history
            WHERE success = 1
              AND date(created_at) >= date('now', '-{} days')
              AND (LENGTH(comment_text) < 10 OR LENGTH(comment_text) > 100)
            """.format(days)
        ).fetchone()

    total = row["total"] if row else 0
    success = row["success"] if row else 0
    failed = row["failed"] if row else 0

    return {
        "period_days": days,
        "total_comments": total,
        "success_count": success,
        "failed_count": failed,
        "success_rate": (success / total * 100) if total > 0 else 0,
        "avg_length": round(length_stats["avg_len"], 1) if length_stats and length_stats["avg_len"] else 0,
        "min_length": length_stats["min_len"] if length_stats else 0,
        "max_length": length_stats["max_len"] if length_stats else 0,
        "quality_issues": quality_issues["count"] if quality_issues else 0,
    }


@_retry_on_db_lock(max_retries=3)
def get_low_quality_comments(
    days: int = 7,
    limit: int = 10,
    user_id: str | None = None,
) -> list[dict]:
    """품질 이상 의심 댓글 목록 (짧거나 긴 것)"""
    with _conn(user_id) as conn:
        rows = conn.execute(
            """
            SELECT
                post_url,
                blog_id,
                post_title,
                comment_text,
                LENGTH(comment_text) as length,
                created_at
            FROM comment_history
            WHERE success = 1
              AND date(created_at) >= date('now', '-{} days')
              AND (LENGTH(comment_text) < 15 OR LENGTH(comment_text) > 80)
            ORDER BY created_at DESC
            LIMIT {}
            """.format(days, limit),
        ).fetchall()

    return [
        {
            "post_url": row["post_url"],
            "blog_id": row["blog_id"],
            "post_title": row["post_title"],
            "comment_text": row["comment_text"],
            "length": row["length"],
            "created_at": row["created_at"],
        }
        for row in rows
    ]


# ── retry_queue (재시도 관리) ────────────────────────────────────────────


@_retry_on_db_lock(max_retries=3)
def add_to_retry_queue(
    blog_id: str,
    post_url: str,
    post_title: str,
    fail_reason: str | None = None,
    user_id: str | None = None,
) -> None:
    """실패한 댓글을 재시도 큐에 추가"""
    with _conn(user_id) as conn:
        conn.execute(
            """
            INSERT INTO retry_queue
                (blog_id, post_url, post_title, fail_count, fail_reason, last_try_at)
            VALUES (?, ?, ?, 1, ?, datetime('now','localtime'))
            ON CONFLICT(post_url) DO UPDATE SET
                fail_count = fail_count + 1,
                fail_reason = COALESCE(excluded.fail_reason, fail_reason),
                last_try_at = excluded.last_try_at,
                should_retry = 0  -- 재시도 여부 미정으로 초기화
            """,
            (blog_id, post_url, post_title, fail_reason),
        )


@_retry_on_db_lock(max_retries=3)
def set_retry_decision(post_url: str, should_retry: bool, user_id: str | None = None) -> None:
    """재시도 여부 결정 (1: 예, 2: 아니오)"""
    with _conn(user_id) as conn:
        conn.execute(
            """
            UPDATE retry_queue
            SET should_retry = ?,
                next_try_at = CASE WHEN ? = 1 THEN date('now','+1 day') ELSE NULL END
            WHERE post_url = ?
            """,
            (1 if should_retry else 2, 1 if should_retry else 0, post_url),
        )


@_retry_on_db_lock(max_retries=3)
def get_retry_targets(user_id: str | None = None) -> list[dict]:
    """오늘 재시도할 대상 목록 조회"""
    with _conn(user_id) as conn:
        rows = conn.execute(
            """
            SELECT blog_id, post_url, post_title, fail_count
            FROM retry_queue
            WHERE should_retry = 1
              AND (next_try_at IS NULL OR date(next_try_at) <= date('now','localtime'))
              AND fail_count < 3
            ORDER BY fail_count, created_at
            """
        ).fetchall()
    return [
        {
            "blog_id": row["blog_id"],
            "post_url": row["post_url"],
            "post_title": row["post_title"],
            "fail_count": row["fail_count"],
        }
        for row in rows
    ]


@_retry_on_db_lock(max_retries=3)
def remove_from_retry_queue(post_url: str, user_id: str | None = None) -> None:
    """재시도 큐에서 제거 (성공 시)"""
    with _conn(user_id) as conn:
        conn.execute("DELETE FROM retry_queue WHERE post_url = ?", (post_url,))


# ── post_history ──────────────────────────────────────────────────────────

def record_post(
    title: str,
    body: str,
    hashtags: list[str],
    image_paths: list[str],
    status: str = "draft",
    category: str | None = None,
    user_id: str | None = None,
) -> int:
    """게시물 이력 저장. 생성된 row id 반환."""
    with _conn(user_id) as conn:
        cursor = conn.execute(
            """
            INSERT INTO post_history (title, body, hashtags, image_paths, status, category)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                title,
                body,
                json.dumps(hashtags, ensure_ascii=False),
                json.dumps(image_paths, ensure_ascii=False),
                status,
                category,
            ),
        )
    return cursor.lastrowid


def update_post_status(
    post_id: int,
    status: str,
    post_url: str | None = None,
    user_id: str | None = None,
) -> None:
    """게시물 상태 업데이트. 발행 후 URL도 함께 저장."""
    with _conn(user_id) as conn:
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


# ── blogger_behavior (오토 블로거 추적) ────────────────────────────────────


@_retry_on_db_lock(max_retries=3)
def record_blogger_reply(
    blog_id: str,
    reply_time_seconds: int,
    reply_text: str,
    user_id: str | None = None,
) -> None:
    """
    블로거의 답글 패턴 기록.
    reply_time_seconds: 내 댓글 후 답글까지 걸린 시간(초)
    """
    with _conn(user_id) as conn:
        # 기존 레코드 확인
        existing = conn.execute(
            "SELECT fast_reply_count, total_replies FROM blogger_behavior WHERE blog_id = ?",
            (blog_id,),
        ).fetchone()

        is_fast_reply = reply_time_seconds <= 60  # 1분 내 답글

        if existing:
            # 업데이트
            conn.execute(
                """
                UPDATE blogger_behavior SET
                    fast_reply_count = fast_reply_count + ?,
                    total_replies = total_replies + 1,
                    last_reply_at = datetime('now','localtime'),
                    updated_at = datetime('now','localtime')
                WHERE blog_id = ?
                """,
                (1 if is_fast_reply else 0, blog_id),
            )
        else:
            # 새로 추가
            conn.execute(
                """
                INSERT INTO blogger_behavior
                    (blog_id, fast_reply_count, total_replies, last_reply_at)
                VALUES (?, ?, 1, datetime('now','localtime'))
                """,
                (blog_id, 1 if is_fast_reply else 0),
            )


@_retry_on_db_lock(max_retries=3)
def update_blogger_pattern_score(blog_id: str, score: int, user_id: str | None = None) -> None:
    """패턴 분석 점수 업데이트 (0-100)"""
    with _conn(user_id) as conn:
        conn.execute(
            """
            INSERT INTO blogger_behavior (blog_id, pattern_score, updated_at)
            VALUES (?, ?, datetime('now','localtime'))
            ON CONFLICT(blog_id) DO UPDATE SET
                pattern_score = excluded.pattern_score,
                updated_at = excluded.updated_at
            """,
            (blog_id, max(0, min(100, score))),
        )


@_retry_on_db_lock(max_retries=3)
def get_blogger_suspicion_score(blog_id: str, user_id: str | None = None) -> int:
    """
    블로거의 오토 의심 점수 계산 (0-100)
    - 패턴 점수 50%
    - 빠른 답글 비율 30%
    - 활동 빈도 20%
    """
    with _conn(user_id) as conn:
        row = conn.execute(
            """
            SELECT
                pattern_score,
                fast_reply_count,
                total_replies
            FROM blogger_behavior
            WHERE blog_id = ?
            """,
            (blog_id,),
        ).fetchone()

    if not row:
        return 0  # 데이터 없음 = 정상으로 간주

    pattern_score = row["pattern_score"] or 0
    fast_count = row["fast_reply_count"] or 0
    total = row["total_replies"] or 1

    # 빠른 답글 비율 (최대 30점)
    fast_ratio = min(1.0, fast_count / max(1, total))
    fast_score = int(fast_ratio * 30)

    # 패턴 점수 (최대 50점)
    pattern = min(50, pattern_score)

    # 활동 빈도 점수 (최대 20점) - 총 답글 수가 많을수록 의심
    activity_score = min(20, total // 5)  # 5개당 1점, 최대 20점

    return pattern + fast_score + activity_score


@_retry_on_db_lock(max_retries=3)
def get_auto_blogger_list(min_score: int = 70, user_id: str | None = None) -> list[str]:
    """의심 점수 기준 이상의 블로거 ID 목록 반환"""
    with _conn(user_id) as conn:
        rows = conn.execute(
            """
            SELECT blog_id FROM blogger_behavior
            WHERE pattern_score >= ?
               OR (fast_reply_count >= 3 AND total_replies >= 3)
            """,
            (min_score,),
        ).fetchall()
    return [row["blog_id"] for row in rows]


@_retry_on_db_lock(max_retries=3)
def should_skip_blogger(
    blog_id: str,
    threshold_high: int = 70,
    threshold_low: int = 40,
    user_id: str | None = None,
) -> tuple[bool, str]:
    """
    블로거 스킵 여부 결정
    Returns: (should_skip, reason)
    - 점수 >= threshold_high: 항상 스킵
    - threshold_low <= 점수 < threshold_high: 30% 확률 스킵
    - 점수 < threshold_low: 스킵 안 함
    """
    score = get_blogger_suspicion_score(blog_id, user_id=user_id)

    if score >= threshold_high:
        return True, f"오토 블로거 의심 (점수: {score})"

    if score >= threshold_low:
        import random
        if random.random() < 0.3:  # 30% 확률 스킵
            return True, f"오토 블로거 추정 (점수: {score}, 30% 랜덤 스킵)"

    return False, ""


@_retry_on_db_lock(max_retries=3)
def get_blogger_behavior_stats(days: int = 30, user_id: str | None = None) -> list[dict]:
    """오토 블로거 추적 통계 조회"""
    with _conn(user_id) as conn:
        rows = conn.execute(
            """
            SELECT
                blog_id,
                pattern_score,
                fast_reply_count,
                total_replies,
                ROUND(CAST(fast_reply_count AS FLOAT) / MAX(total_replies, 1) * 100, 1) as fast_ratio,
                last_reply_at,
                first_detected_at
            FROM blogger_behavior
            WHERE first_detected_at >= date('now', '-{} days')
               OR last_reply_at >= date('now', '-{} days')
            ORDER BY pattern_score DESC, fast_reply_count DESC
            """.format(days, days),
        ).fetchall()

    return [
        {
            "blog_id": row["blog_id"],
            "pattern_score": row["pattern_score"],
            "fast_reply_count": row["fast_reply_count"],
            "total_replies": row["total_replies"],
            "fast_ratio": row["fast_ratio"],
            "last_reply_at": row["last_reply_at"],
            "first_detected_at": row["first_detected_at"],
        }
        for row in rows
    ]
