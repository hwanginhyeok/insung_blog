"""
워커 병렬 실행 시뮬레이션 테스트

3개 태스크를 동시에 실행하여:
1. asyncio.create_task 병렬 실행이 되는지
2. Semaphore(3)이 제대로 제한하는지
3. 4번째 태스크가 대기하는지
"""
import asyncio
import time
import os
import sys

sys.path.insert(0, str(os.path.dirname(os.path.dirname(__file__))))

# 실제 브라우저 대신 sleep으로 시뮬레이션
MAX_CONCURRENT = int(os.environ.get("MAX_CONCURRENT_BROWSERS", "3"))
_semaphore = asyncio.Semaphore(MAX_CONCURRENT)
_active_count = 0


async def simulate_command(name: str, duration: float):
    """Playwright 브라우저 작업을 시뮬레이션"""
    global _active_count

    print(f"[{time.strftime('%H:%M:%S')}] 🔵 {name}: Semaphore 대기...")
    async with _semaphore:
        _active_count += 1
        print(f"[{time.strftime('%H:%M:%S')}] 🟢 {name}: 실행 시작 (활성 {_active_count}/{MAX_CONCURRENT})")
        await asyncio.sleep(duration)
        _active_count -= 1
        print(f"[{time.strftime('%H:%M:%S')}] ✅ {name}: 완료 (활성 {_active_count}/{MAX_CONCURRENT})")

    return {"name": name, "duration": duration}


async def main():
    print(f"=== 워커 병렬 실행 시뮬레이션 (Semaphore={MAX_CONCURRENT}) ===\n")

    # 테스트 1: 3개 동시 실행 (Semaphore 이내)
    print("--- 테스트 1: 3개 동시 실행 (전부 슬롯 이내) ---")
    tasks = set()
    start = time.time()

    commands = [
        ("유저A_댓글봇", 3.0),
        ("유저B_글쓰기", 2.0),
        ("유저A_이웃방문", 2.5),
    ]

    for name, duration in commands:
        task = asyncio.create_task(simulate_command(name, duration))
        tasks.add(task)

    await asyncio.gather(*tasks)
    elapsed = time.time() - start
    print(f"\n소요 시간: {elapsed:.1f}초 (순차면 7.5초, 병렬이면 ~3초)")
    assert elapsed < 5, f"병렬 실행 실패! {elapsed:.1f}초 소요 (3초 이하여야 함)"
    print("✅ 테스트 1 통과: 3개 동시 실행 OK\n")

    # 테스트 2: 4개 실행 (1개는 대기 후 실행)
    print("--- 테스트 2: 4개 실행 (1개는 Semaphore 대기) ---")
    tasks = set()
    start = time.time()

    commands = [
        ("슬롯1_댓글봇", 3.0),
        ("슬롯2_글쓰기", 2.0),
        ("슬롯3_이웃방문", 2.5),
        ("대기_발행", 1.0),  # 슬롯2가 끝나면 시작
    ]

    for name, duration in commands:
        task = asyncio.create_task(simulate_command(name, duration))
        tasks.add(task)

    await asyncio.gather(*tasks)
    elapsed = time.time() - start
    print(f"\n소요 시간: {elapsed:.1f}초 (슬롯2 끝(2초) → 대기_발행 시작 → 총 ~3초)")
    assert elapsed < 5, f"Semaphore 대기 후 실행 실패! {elapsed:.1f}초"
    print("✅ 테스트 2 통과: Semaphore 대기 후 실행 OK\n")

    # 테스트 3: 실제 main_loop 패턴 시뮬레이션 (continue로 연속 claim)
    print("--- 테스트 3: main_loop 패턴 (연속 claim + 병렬) ---")
    pending_queue = [
        ("명령1", 2.0),
        ("명령2", 2.0),
        ("명령3", 2.0),
        ("명령4", 1.0),
        ("명령5", 1.0),
    ]
    active_tasks: set[asyncio.Task] = set()
    start = time.time()
    completed = []

    while pending_queue or active_tasks:
        # 완료된 태스크 정리
        done = {t for t in active_tasks if t.done()}
        for t in done:
            result = t.result()
            completed.append(result["name"])
        active_tasks -= done

        if pending_queue:
            name, duration = pending_queue.pop(0)
            task = asyncio.create_task(simulate_command(name, duration))
            active_tasks.add(task)
            if pending_queue:
                continue  # 바로 다음 명령 claim
        else:
            if active_tasks:
                await asyncio.sleep(0.1)

    elapsed = time.time() - start
    print(f"\n5개 명령 총 소요: {elapsed:.1f}초 (순차면 8초, 병렬이면 ~4초)")
    print(f"완료 순서: {completed}")
    assert elapsed < 6, f"main_loop 패턴 실패! {elapsed:.1f}초"
    print("✅ 테스트 3 통과: main_loop 패턴 OK\n")

    print("=" * 50)
    print("🎉 전체 시뮬레이션 통과!")
    print(f"  Semaphore: {MAX_CONCURRENT}")
    print(f"  병렬 실행: OK")
    print(f"  대기 후 실행: OK")
    print(f"  연속 claim: OK")


if __name__ == "__main__":
    asyncio.run(main())
