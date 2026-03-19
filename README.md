<div align="center">

# 🎧 숲(SOOP/아프리카TV) 라디오 모드 — 크롬 확장 프로그램

### Stream Radio Mode for SOOP (AfreecaTV)

[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white)](https://github.com/)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-34A853?style=for-the-badge)](https://developer.chrome.com/docs/extensions/mv3/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)](LICENSE)

**영상은 끄고, 소리만 듣고, 일하는 척하자.**

숲(SOOP, 구 아프리카TV) PC 라이브 방송을 라디오처럼 들을 수 있는 크롬 확장 프로그램입니다.<br>
라디오 모드 · 루팡 모드(탭 위장) · 대역폭 자동 절약

[설치 방법](#-설치-방법) · [기능 소개](#-기능-소개) · [단축키](#-단축키) · [FAQ](#-faq)

</div>

---

## 🤔 왜 필요한가요?

> 회사에서 숲 틀어놓고 싶은데... 화면이 보이면 안 되잖아요.

| 문제 | Stream Radio Mode |
|:---|:---|
| 방송 화면이 모니터에 보임 | 🎧 **라디오 모드** — 오디오만 재생, 화면은 깔끔한 오버레이 |
| 탭 제목에 "숲"이 보임 | 🕶 **루팡 모드** — 탭이 "Google Docs"로 위장 |
| 인터넷 사용량이 많아 ISP에 걸림 | 📉 **대역폭 절약** — 최대 90% 트래픽 감소 |
| 모바일엔 라디오 모드가 있는데 PC엔 없음 | ✅ **PC에서도 라디오 모드** 사용 가능 |

---

## ✨ 기능 소개

### 🎧 라디오 모드

영상을 끄고 오디오만 재생합니다. GPU 렌더링이 중단되어 PC 자원도 절약됩니다.

<!-- 스크린샷: 라디오 모드 오버레이 UI -->
<!-- ![라디오 모드](docs/radio-mode.png) -->

```
┌─────────────────────────────────┐
│          🎧                     │
│       RADIO MODE                │
│                                 │
│     [스트리머 프로필 이미지]      │
│       스트리머 이름              │
│       방송 제목                  │
│                                 │
│    ♪ ▎▌▎▌▎▎▌▎▌▎▎▌▎▎ ♪          │
│                                 │
│    🔊 ━━━━━━●━━━━━━ 100%       │
│                                 │
│  [📺 비디오 전환] [🕶 루팡 모드]  │
└─────────────────────────────────┘
```

**포함된 기능:**
- 스트리머 프로필 이미지, 이름, 방송 제목 표시
- 오디오 시각화 바 애니메이션
- 볼륨 조절 + 음소거 토글
- 비디오 모드 복귀 버튼
- 루팡 모드 진입 버튼

---

### 🕶 루팡 모드 (탭 위장)

버튼 하나로 탭을 업무용 화면으로 위장합니다. **오디오는 계속 재생**됩니다.

<!-- 스크린샷: 탭 위장 상태 -->
<!-- ![루팡 모드](docs/lupin-mode.png) -->

| 항목 | 적용 전 | 적용 후 |
|:---|:---|:---|
| **탭 제목** | 숲 - BJ이름 라이브 | Google Docs - 업무 보고서.docx |
| **파비콘** | 숲 로고 | 📄 Google Docs 아이콘 |
| **오디오** | 재생 중 | **계속 재생** (들으면서 일하기!) |
| **화면** | 자동으로 다른 탭으로 전환 | — |

> 사이트가 동적으로 탭 제목을 바꿔도 MutationObserver로 차단합니다.

---

### 📉 대역폭 절약 (자동)

라디오 모드 진입 시 **자동으로 최저 화질로 전환**하여 인터넷 사용량을 줄입니다.

```
비디오 모드 (1080p)          라디오 모드 (자동 LOW)
━━━━━━━━━━━━━━━━━━━━        ━━━━
    ~5-8 Mbps               ~0.3 Mbps

         📉 약 90% 절약!
```

**이런 분에게 유용합니다:**
- 회사/학교 네트워크에서 트래픽 제한이 있는 경우
- ISP의 QoS(트래픽 관리) 정책이 걱정되는 경우
- 모바일 테더링으로 방송을 듣는 경우
- 그리드 딜리버리(P2P) 업로드가 부담되는 경우

---

## 🌐 지원 브라우저

| 브라우저 | 지원 | 비고 |
|:---|:---:|:---|
| **Chrome** | ✅ | 권장 |
| **Edge** | ✅ | 그대로 동작 |
| **Whale (웨일)** | ✅ | 그대로 동작 |
| **Brave** | ✅ | 그대로 동작 |
| **Opera** | ✅ | 그대로 동작 |
| Firefox | ❌ | Manifest V3 비호환 |
| Safari | ❌ | 미지원 |

> Chromium 기반 브라우저라면 모두 사용 가능합니다.

---

## 🚀 설치 방법

> Chrome Web Store 등록 전이므로 수동 설치가 필요합니다.

### 1단계: 다운로드

```bash
git clone https://github.com/Hahamin/stream-radio-mode.git
```

또는 [**Download ZIP**](https://github.com/Hahamin/stream-radio-mode/archive/refs/heads/main.zip) 을 클릭하여 압축 파일을 다운로드 후 압축 해제합니다.

### 2단계: 크롬에 설치

1. 크롬 주소창에 `chrome://extensions/` 입력
2. 우측 상단의 **개발자 모드** 활성화
3. **"압축 해제된 확장 프로그램을 로드합니다"** 클릭
4. 다운로드한 `stream-radio-mode` 폴더 선택

<!-- 스크린샷: 크롬 확장 설치 화면 -->
<!-- ![설치](docs/install.png) -->

### 3단계: 사용

1. [숲(SOOP)](https://www.sooplive.co.kr/) 라이브 방송 접속
2. 플레이어 좌하단 **🎧 버튼** 클릭 또는 **Alt+R**

**끝!** 🎉

---

## ⌨️ 단축키

| 단축키 | 기능 |
|:---:|:---|
| `Alt` + `R` | 라디오 모드 토글 |
| `Alt` + `B` | 루팡 모드 토글 |

> 단축키는 `chrome://extensions/shortcuts` 에서 변경할 수 있습니다.

---

## 📁 프로젝트 구조

```
stream-radio-mode/
├── manifest.json              # Chrome Extension 설정 (Manifest V3)
├── content/
│   ├── core.js                # 라디오 모드 엔진
│   ├── ui.js                  # 오버레이 UI
│   ├── boss.js                # 루팡 모드 (탭 위장)
│   ├── bandwidth.js           # 대역폭 절약 (content script)
│   ├── bandwidth-inject.js    # 대역폭 절약 (page context)
│   └── soop.js                # 숲(SOOP) 어댑터
├── popup/                     # 확장 팝업 UI
├── background/
│   └── service-worker.js      # 단축키 + 상태 관리
├── styles/
│   └── radio-overlay.css      # 오버레이 스타일
└── icons/                     # 확장 아이콘
```

---

## 🔧 기술 스택

| 기술 | 용도 |
|:---|:---|
| **Chrome Extension Manifest V3** | 확장 프로그램 기반 |
| **Content Scripts** | 사이트 DOM 조작 + 플레이어 제어 |
| **Page Context Injection** | SOOP `livePlayer` API 직접 호출 |
| **MutationObserver** | 동적 DOM 변화 감지 + 탭 제목 보호 |
| **chrome.storage** | 설정 영속화 |
| **CSS Animations** | 오디오 시각화 바 |

---

## ❓ FAQ

<details>
<summary><b>라디오 모드에서 실제로 인터넷 사용량이 줄어드나요?</b></summary>

네. 라디오 모드 진입 시 SOOP의 내부 API(`livePlayer.changeQuality`)를 호출하여 실제로 최저 화질 스트림으로 전환합니다. 단순히 화면만 숨기는 게 아니라 **서버에서 받는 데이터 자체가 줄어듭니다.**

- 비디오 모드 (1080p): ~5-8 Mbps
- 라디오 모드 (LOW): ~0.3-0.5 Mbps
</details>

<details>
<summary><b>루팡 모드에서 소리가 들리나요?</b></summary>

네! 루팡 모드는 **탭 제목과 파비콘만 위장**합니다. 오디오는 그대로 재생됩니다. 이어폰을 꼽고 들으면서 일하세요.
</details>

<details>
<summary><b>사이트 업데이트 후 작동이 안 돼요</b></summary>

숲(SOOP)의 DOM 구조가 변경되면 일부 기능이 작동하지 않을 수 있습니다. [이슈](https://github.com/Hahamin/stream-radio-mode/issues)를 등록해주시면 빠르게 대응하겠습니다.
</details>

<details>
<summary><b>다른 스트리밍 사이트도 지원하나요?</b></summary>

현재는 숲(SOOP)만 지원합니다. 어댑터 패턴으로 설계되어 있어 새 사이트 추가가 용이합니다. PR 환영합니다!
</details>

---

## 🤝 기여하기

기여를 환영합니다! 다음과 같은 방법으로 참여할 수 있습니다:

1. **버그 리포트** — [이슈 등록](https://github.com/Hahamin/stream-radio-mode/issues)
2. **기능 제안** — 새로운 아이디어 공유
3. **코드 기여** — Fork → Branch → PR
4. **새 사이트 어댑터** — 다른 스트리밍 사이트 지원 추가

---

## 📜 라이선스

[MIT License](LICENSE) — 자유롭게 사용, 수정, 배포할 수 있습니다.

---

<div align="center">

**⭐ 이 프로젝트가 유용하다면 Star를 눌러주세요!**

Made with 🎧 for 직장인 & 학생 루팡러

</div>
