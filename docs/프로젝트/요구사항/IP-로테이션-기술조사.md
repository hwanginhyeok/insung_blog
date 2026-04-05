# IP 로테이션 기술 조사 레포트

> 작성일: 2026-04-05
> 목적: 프록시 비용 절감을 위한 LTE USB 동글 IP 로테이션 실현 가능성 조사
> 상태: 조사 완료 — 기술적으로 가능, 구현은 유저 20명+ 시점

---

## 1. 문제 정의

현재 아키텍처에서 모든 유저의 네이버 댓글이 서버 IP 1개에서 나감.
유저 수 증가 시 네이버가 "같은 IP에서 다수 계정 활동" 감지 → 차단 위험.

**주거용 프록시 비용**: $5/IP/월 × (유저수/2) → 50명이면 ₩172,500/월 (비용의 35-50%)

---

## 2. 대안 비교

| 방법 | 초기 비용 | 월 비용 | IP 변경 신뢰도 | 자동화 | WSL2 호환 | 판정 |
|------|---------|--------|-------------|--------|----------|------|
| **LTE USB 동글** | 5-8만원 | 1-2만원 | 높음 | 가능 (AT/mmcli) | mirrored 모드 | **채택** |
| 안드로이드 테더링 | 0원 | 0원 | 높음 | 가능하나 불안정 | 낮음 | 백업 |
| 가정용 공유기 재시작 | 0원 | 0원 | 매우 낮음 | 가능 | 해당없음 | **탈락** |
| 주거용 프록시 | 0원 | 5-30만원 | 매우 높음 | 불필요 | 완벽 | 비싸지만 확실 |

---

## 3. LTE 동글 IP 로테이션 — 왜 되는가

### CGNAT (Carrier-Grade NAT)
- 모바일 통신사는 수천 명이 공인 IP를 공유하는 CGNAT 사용
- 재접속 시 CGNAT IP 풀에서 **다른 공인 IP 배정**
- 단일 동글이 **10만 개 이상의 고유 IP** 순환 가능

### 모바일 IP가 최고인 이유
- 네이버가 모바일 IP 대역을 차단하면 해당 지역 일반 유저 전체가 차단됨
- 따라서 플랫폼이 모바일 IP 차단을 극도로 꺼림
- 데이터센터 IP보다 **신뢰도가 압도적으로 높음**

### 한국 통신사별 IP 풀

| 통신사 | CGNAT | IP 대역 | 알뜰폰(MVNO) |
|--------|-------|---------|-------------|
| SKT | 사용 | 223.33.x, 223.38.x, 223.62.x | 동일 풀 사용 |
| KT | 사용 | 별도 대역 | 동일 풀 사용 |
| LG U+ | 사용 | 별도 대역 | 동일 풀 사용 |

> 알뜰폰(MVNO)은 모망(SKT/KT/LGU+) 네트워크 그대로 사용 → IP 풀 동일, 요금만 저렴

---

## 4. 제품 선정

### 추천 동글

| 제품 | 가격 | Linux 호환 | 제어 방식 | 비고 |
|------|------|-----------|---------|------|
| **화웨이 E8372h-320** | 7-8만원 | 검증됨 | HiLink HTTP API | USB + WiFi 겸용, 가장 많이 검증 |
| 화웨이 E3372h | 3-4만원 (해외직구) | 검증됨 | AT 커맨드 | 프록시 팜에서 가장 많이 쓰는 모델 |
| ZTE MF79U | 5-6만원 | 가능 | AT 커맨드 | 쿠팡 구매 가능 |

### SIM 요금제

| 통신사 | 데이터 | 월 요금 | 비고 |
|--------|-------|---------|------|
| 알뜰폰 2.5GB | 2.5GB | ₩11,800 | 이미지 차단 시 충분 |
| 알뜰폰 5GB | 5GB | ₩15,000 | 여유 있음 |
| 알뜰폰 무제한 (저속) | 무제한 | ₩20,000 | 안전 |

### 트래픽 산정

| 조건 | 유저당/일 | 유저당/월 |
|------|---------|---------|
| 이미지 로딩 ON | ~900MB | ~27GB |
| **이미지 차단 (권장)** | **~150MB** | **~4.5GB** |

> Playwright에서 이미지 차단: `page.route("**/*.{png,jpg,gif,webp}", lambda r: r.abort())`
> 댓글 작성에 이미지는 불필요 → 트래픽 83% 절감

---

## 5. WSL2 연동 아키텍처

### 권장: mirrored 네트워킹 모드

```ini
# %USERPROFILE%/.wslconfig
[wsl2]
networkingMode=mirrored
autoProxy=true
```

이렇게 하면 WSL2가 Windows 네트워크 인터페이스를 미러링.
Windows에서 동글을 관리하고, WSL2 안의 Playwright가 자동으로 동글 네트워크 사용.

### 구조

```
[LTE USB 동글] --USB--> [Windows 11]
                         ├── 동글 드라이버 (자동 인식)
                         ├── 네트워크 인터페이스 (NDIS)
                         └── .wslconfig (mirrored)
                              └── [WSL2 Ubuntu]
                                   ├── command_worker.py
                                   ├── rotate_ip.py (동글 재접속)
                                   └── Playwright → 네이버 (동글 IP 경유)
```

### USB 직접 패스스루 (usbipd-win) — 비추천

- 동글 재접속 시 USB 디바이스가 리셋되어 재바인딩 필요
- 자동화가 깨지기 쉬움
- mirrored 네트워킹이 훨씬 안정적

---

## 6. 프로그래밍 제어

### 방법 1: 화웨이 HiLink API (E8372 전용, 가장 깔끔)

```python
import requests

DONGLE_IP = "192.168.8.1"

def rotate_ip():
    """동글 모바일 데이터 OFF→ON으로 새 IP 획득."""
    # 데이터 끄기
    requests.post(f"http://{DONGLE_IP}/api/dialup/dial",
                  data="<request><Action>0</Action></request>",
                  headers={"Content-Type": "text/xml"})
    time.sleep(5)
    # 데이터 켜기
    requests.post(f"http://{DONGLE_IP}/api/dialup/dial",
                  data="<request><Action>1</Action></request>",
                  headers={"Content-Type": "text/xml"})
    time.sleep(15)  # 재접속 대기

def get_current_ip():
    """현재 공인 IP 확인."""
    return requests.get("https://api.ipify.org").text
```

### 방법 2: AT 커맨드 (범용)

```bash
# 비행기 모드 ON → OFF (라디오 리셋)
echo -e "AT+CFUN=0\r" > /dev/ttyUSB0
sleep 3
echo -e "AT+CFUN=1\r" > /dev/ttyUSB0
sleep 15  # 네트워크 재등록 대기
```

### 방법 3: ModemManager (Linux)

```bash
mmcli -m 0 --simple-disconnect
sleep 3
mmcli -m 0 --simple-connect="apn=internet"
sleep 15
```

### IP 로테이션 소요 시간

| 방법 | 소요 시간 | 새 IP 확률 |
|------|---------|-----------|
| HiLink API | 15-20초 | 높음 |
| AT+CFUN 토글 | 15-20초 | 높음 |
| mmcli | 15-20초 | 높음 |
| USB unbind/bind | 20-25초 | 매우 높음 |

> 보수적으로 **30초** 잡는 것이 안전

---

## 7. 워커 통합 설계 (구현 시)

### rotate_ip.py

```python
"""LTE 동글 IP 로테이션 모듈."""
import time
import requests
import subprocess

class LTERotator:
    def __init__(self, dongle_ip="192.168.8.1", method="hilink"):
        self.dongle_ip = dongle_ip
        self.method = method

    def rotate(self) -> str:
        """IP 로테이션 실행, 새 IP 반환."""
        old_ip = self.get_ip()
        self._disconnect()
        time.sleep(5)
        self._connect()
        time.sleep(20)
        new_ip = self.get_ip()
        if new_ip == old_ip:
            # 같은 IP면 한번 더 시도
            self._disconnect()
            time.sleep(10)
            self._connect()
            time.sleep(20)
            new_ip = self.get_ip()
        return new_ip

    def get_ip(self) -> str:
        return requests.get("https://api.ipify.org", timeout=10).text

    def _disconnect(self): ...
    def _connect(self): ...
```

### command_worker.py 통합

```python
# 유저 배치 사이에 IP 로테이션
for user_batch in batched_users(users, batch_size=2):
    for user in user_batch:
        await process_user_commands(user)
    # 2유저 처리 후 IP 교체
    if lte_rotator:
        new_ip = lte_rotator.rotate()
        logger.info(f"[IP 로테이션] {new_ip}")
```

---

## 8. 비용 요약

### 초기 투자

| 항목 | 비용 |
|------|------|
| 화웨이 E8372h 동글 | ₩70,000 |
| 알뜰폰 데이터 SIM | ₩10,000 (개통비) |
| **합계** | **₩80,000 (1회)** |

### 월간 운영비

| 항목 | 비용 |
|------|------|
| 알뜰폰 SIM (5GB) | ₩15,000 |
| 동글 2개 운영 시 | ₩30,000 |

### 프록시 대비 절감액 (50명 기준)

| | 프록시 | 동글 | 절감 |
|---|------|------|------|
| 월비용 | ₩172,500 | ₩30,000 | **₩142,500/월** |
| 연비용 | ₩2,070,000 | ₩360,000 | **₩1,710,000/년** |

---

## 9. 리스크 및 한계

| 리스크 | 영향 | 대응 |
|--------|------|------|
| 동글 고장 | 서비스 중단 | 예비 동글 1개 보유 (₩40,000) |
| 통신사 IP 풀 소진 | 같은 IP 재배정 | 재접속 1회 더 시도 |
| WSL2 mirrored 모드 불안정 | 네트워크 끊김 | Windows 네이티브 프록시 서버로 우회 |
| 알뜰폰 데이터 소진 | 속도 저하 | 이미지 차단으로 트래픽 절감, 5GB 이상 요금제 |
| 동글 2개로 동시 2배치만 가능 | 처리 속도 제한 | 로테이션 시간(30초)이 블로거 대기(30-60초)와 겹쳐서 실질적 영향 적음 |

---

## 10. 대안: 안드로이드 폰 USB 테더링

### 가능하지만 비추천

- ADB로 비행기 모드 토글 → IP 변경 가능
- 비용 ₩0 (기존 폰+SIM 활용)
- 하지만: 테더링 재활성화 불안정, WSL2 호환 낮음, 폰 사용 불가

### ADB 자동화 (참고용)

```bash
# 비행기 모드 ON
adb shell cmd connectivity airplane-mode enable
sleep 15
# 비행기 모드 OFF
adb shell cmd connectivity airplane-mode disable
```

> 참고 프로젝트: [github.com/d0rb/ADB-IP-ROTATION](https://github.com/d0rb/ADB-IP-ROTATION)

### 판정: 동글 구매 전 테스트용으로만 사용

---

## 11. 구현 타임라인

| 시점 | 작업 |
|------|------|
| 유저 10명 | IP 1개로 운영 (아직 안전) |
| 유저 15-20명 | 동글 1개 구매 + SIM 개통 + mirrored 모드 테스트 |
| 유저 20명+ | rotate_ip.py 구현 + command_worker 통합 |
| 유저 50명+ | 동글 2개 운영, 배치 스케줄러 고도화 |
| 유저 100명+ | 동글 한계 → 프록시 or 서버 분산 병행 |
