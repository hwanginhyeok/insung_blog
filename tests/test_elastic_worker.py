"""
Elastic Semaphore 테스트 — 유저별 슬롯 동적 분배 검증

테스트 시나리오:
1. 유저A 혼자 → 슬롯 3개 전부 사용
2. 유저B 등장 → 슬롯 분배 (A:1~2, B:1~2)
3. 유저B 끝남 → A 다시 3개 사용
"""
import asyncio
import os
import sys
import time

sys.path.insert(0, str(os.path.dirname(os.path.dirname(__file__))))

from command_worker import (
    MAX_CONCURRENT_BROWSERS,
    _browser_semaphore,
    _user_active_slots,
    acquire_user_slot,
    get_slots_for_user,
    release_user_slot,
)


def test_slot_allocation():
    """유저별 슬롯 할당 계산 테스트"""
    # 초기화
    _user_active_slots.clear()

    # 유저 없을 때
    assert get_slots_for_user("userA") == MAX_CONCURRENT_BROWSERS  # 3
    print(f"✅ 유저 없음 → 신규 유저 할당: {MAX_CONCURRENT_BROWSERS}")

    # 유저A만 활성
    acquire_user_slot("userA")
    slots_a = get_slots_for_user("userA")
    assert slots_a == MAX_CONCURRENT_BROWSERS  # A 혼자 → 3
    print(f"✅ 유저A 혼자 → A 할당: {slots_a}")

    # 유저B 등장
    slots_b = get_slots_for_user("userB")  # B는 아직 미등록
    assert slots_b >= 1
    print(f"✅ 유저B 등장 → B 할당: {slots_b}")

    acquire_user_slot("userB")
    slots_a = get_slots_for_user("userA")
    slots_b = get_slots_for_user("userB")
    assert slots_a >= 1
    assert slots_b >= 1
    print(f"✅ 유저A+B 활성 → A:{slots_a}, B:{slots_b}")

    # 유저B 끝남
    release_user_slot("userB")
    slots_a = get_slots_for_user("userA")
    assert slots_a == MAX_CONCURRENT_BROWSERS  # A 혼자 → 다시 3
    print(f"✅ 유저B 끝남 → A 할당: {slots_a}")

    # 유저A도 끝남
    release_user_slot("userA")
    assert len(_user_active_slots) == 0
    print("✅ 전부 끝남 → 슬롯 카운터 비어있음")

    _user_active_slots.clear()


async def test_parallel_with_elastic():
    """실제 병렬 실행 + Elastic 슬롯 시뮬레이션"""
    _user_active_slots.clear()
    results = []

    async def simulate_user_work(user_id: str, task_name: str, duration: float):
        acquire_user_slot(user_id)
        slots = get_slots_for_user(user_id)
        async with _browser_semaphore:
            start = time.time()
            results.append(f"[{time.strftime('%H:%M:%S')}] 🟢 {task_name} 시작 (유저당 슬롯: {slots})")
            await asyncio.sleep(duration)
            results.append(f"[{time.strftime('%H:%M:%S')}] ✅ {task_name} 완료 ({duration}초)")
        release_user_slot(user_id)

    # 시나리오: A가 3개 시작 → 1초 후 B가 1개 요청
    print("\n--- 시나리오: A 3개 + B 1개 (Semaphore=3) ---")
    start = time.time()

    tasks = [
        asyncio.create_task(simulate_user_work("A", "A_댓글봇1", 3.0)),
        asyncio.create_task(simulate_user_work("A", "A_댓글봇2", 3.0)),
        asyncio.create_task(simulate_user_work("A", "A_댓글봇3", 3.0)),
    ]

    await asyncio.sleep(0.5)
    # B가 요청 — Semaphore 꽉 찬 상태이므로 A 하나 끝나면 시작
    tasks.append(asyncio.create_task(simulate_user_work("B", "B_글쓰기", 1.0)))

    await asyncio.gather(*tasks)
    elapsed = time.time() - start

    for r in results:
        print(f"  {r}")

    print(f"\n  총 소요: {elapsed:.1f}초")
    # A 3개 (3초) + B 1개 (A 하나 끝나야 시작 → 3+1=4초)
    # 실제로는 A 3개가 동시 3초 → B가 바로 시작 1초 = ~4초
    assert elapsed < 5, f"예상보다 오래 걸림: {elapsed:.1f}초"
    print("  ✅ 통과")


async def main():
    print(f"=== Elastic Semaphore 테스트 (MAX={MAX_CONCURRENT_BROWSERS}) ===\n")

    print("--- 슬롯 할당 계산 테스트 ---")
    test_slot_allocation()

    await test_parallel_with_elastic()

    print("\n🎉 전체 테스트 통과!")


if __name__ == "__main__":
    asyncio.run(main())
