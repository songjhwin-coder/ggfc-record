# GGFC V3.25.40 · PWA / 로딩 / 배포 운영 안내

작성일: 2026-10-25 (한국 기준) · 기준 원본: V3.25.39

## A. 수정 전 분석과 주요 병목

원본은 별도 폴더에 보존했습니다. V3.25.39 전체 배포 파일 36개를 분석했습니다. 원본 패키지에는 GitHub Actions workflow가 없습니다. 현재 GitHub 저장소에 별도로 등록된 workflow나 Pages 설정은 확인·변경하지 않았습니다.

**수정 전 실제 흐름**

`HTML → CSS 및 순서 의존 JS → 저장된 Firebase snapshot 표시 → Firebase app/auth/database SDK 순차 로딩 → ggfc/v3 구독 → 최신 snapshot 적용 및 renderAll`

기존에도 즉시 데이터 캐시 표시, 활성 메뉴 렌더링, html2canvas 지연 로딩, SHA-256 검증 정적 캐시가 구현되어 있었습니다. 이 부분을 새 기능처럼 중복 구현하지 않았습니다.

| 조사 항목 | 확인 결과와 조치 |
|---|---|
| HTML/CSS/JS | index.html과 mobile.html은 같은 기능 모듈을 순서대로 로딩. defer로 다운로드와 HTML 파싱을 겹치되 실행 순서 유지 |
| 초기 JS | sync/mobile/details/squad/card-design/alltime/maker/slump/app/duo. 전역 함수·DOM 이벤트가 연결되어 있어 기능별 분할은 보류 |
| 실제 첫 화면 | 관리자 설정의 시작 메뉴가 달라질 수 있음. Squad·Overview뿐 아니라 어떤 공개 메뉴로 시작해도 동작해야 함 |
| 렌더링 | renderAll은 현재 메뉴를 렌더링. 기존 모바일 스와이프 준비·재사용 로직 보존 |
| Firebase | firebase-config.js, SDK 10.12.2 compat, ggfc/v3 전체 실시간 구독. DB 구조·규칙·트랜잭션 그대로 유지 |
| 동일 snapshot | 같은 자료라도 재계산하던 경로 개선. 내용 전체가 같으면 상태·캐시 시각만 갱신 |
| 리스너 | 기존 메뉴 전환마다 새로 구독하지 않음. start 중복 호출·SDK 재시도에도 한 번만 연결하도록 추가 방어 |
| localStorage | Firebase 공개 snapshot, 기존 대표승점 설정/로컬 백업/UI 상태 사용. 기존 설정 저장 방식 유지 |
| sessionStorage | 업데이트 요청 시각만 새로 저장. 비밀번호/DB는 저장하지 않음 |
| 외부 라이브러리 | Firebase는 캐시 화면 뒤에 연결. html2canvas 1.4.1은 이미지 저장 시만 로딩하는 기존 함수 유지. 엑셀은 기존 자체 파서 유지 |
| 기존 정적 캐시 | 29개 정적 자산을 한 버전으로 검증. 기다리는 worker를 적용하려면 모든 탭을 닫아야 했음 |
| 모바일 진입 | index는 화면 폭에 따라 클래스를 적용, mobile.html은 모바일 플래그 사용. 다른 URL로 강제 리다이렉트하지 않음. ?view=desktop 유지 |
| 버전 | 변경된 파일만 URL을 변경하는 기존 방향 유지. 신규 변경부터 콘텐츠 해시를 자동 적용 |

**개선 후 흐름**

`검증된 정적 앱 → 마지막 정상 snapshot 즉시 표시 → Firebase 최신화 → 내용이 달라진 경우에만 재계산/갱신`

`GitHub 배포 → 새 worker와 파일 해시 검증 → 업데이트 안내 → 사용자가 업데이트 선택 → 새 버전 적용`

## B. 실제 수정 사항

1. 상대경로 manifest·앱 아이콘·PWA 메타데이터·오프라인 안내 추가.
2. 사이드바에 **GGFC를 앱으로 설치**, **앱 업데이트 확인** 추가. 설치 버튼은 지원 브라우저가 설치 이벤트를 제공할 때 표시하며 설치 후 숨깁니다. 자동 설치 팝업은 띄우지 않습니다.
3. 새 버전은 화면 하단의 작은 알림에서 **업데이트 / 나중에**로 선택합니다. 데이터 동기화 상태와 앱 업데이트 상태는 별도로 표시합니다.
4. 미저장 설정, 저장/불러오기, 이미지 생성, 열린 작업 창이 있으면 업데이트를 막습니다. 다른 GGFC 탭이나 설치 앱 창이 열려 있으면 닫도록 안내합니다. 다른 창을 강제로 새로고침하지 않습니다.
5. Firebase app SDK가 로드된 다음 auth/database SDK를 병렬 로딩합니다. 연결 실패 후 온라인 복귀 시 재시도하며 중복 구독을 막습니다.
6. Firebase snapshot 전체 JSON이 이전과 동일하면 renderAll을 생략합니다. revision만 같다고 동일 자료로 간주하지 않습니다.
7. 캐시 JSON·구조·형식 버전·보관기간을 확인합니다. 손상·지원하지 않는 형식·180일 초과 캐시는 제거하고 서버 조회로 전환합니다.
8. 캐시 쓰기 실패가 서버 데이터 표시나 관리자 저장을 차단하지 않습니다.
9. 새 스크립트를 defer로 실행하되 DOMContentLoaded 이후에 캐시 화면을 그려 모든 기능 모듈의 준비를 보장합니다.
10. GitHub Actions에서 배포 전에 캐시 목록 생성·경로/문법/해시 검증을 자동 수행합니다.

계산 기능의 9개 JS(app/mobile/details/squad/card-design/alltime/maker/slump/duo)는 원본과 바이트 단위로 동일합니다. ggfc.css, ggfc-export.css, firebase-config.js, database.rules.json도 변경하지 않았습니다. 표시 버전과 배포/연결 코드를 수정했으며 Firebase wire schema의 meta.version='3.18.4'는 호환성을 위해 유지합니다.

## C. 새로 추가된 파일

- `app-version.json` — 표시 버전의 기준
- `manifest.webmanifest` — 앱 이름, 시작 경로, 범위, 테마, 아이콘
- `offline.html` — 저장된 앱이 없는 경우의 안내
- `assets/pwa-update.js` — 설치/업데이트 UI와 worker 등록
- `assets/pwa.css` — 작은 설치/업데이트 UI 스타일
- `icons/ggfc-crest-192.png`, `icons/ggfc-crest-512.png`, `icons/ggfc-crest-maskable-512.png`
- `icons/icon-source.svg` — 아이콘 원본
- `tools/service-worker.template.js` — 캐시 worker 생성 원본
- `tools/check-release.py` — 배포 전 자동 검사
- `.github/workflows/pages.yml` — GitHub Actions 빌드/배포
- `PWA_UPDATE_GUIDE.md` — 이 설명서

배포 소스와 검증용 DB에는 고정 GGFC 헤더 로고 이미지가 포함되어 있지 않아 네이비·민트색 GGFC 모노그램 아이콘을 제작했습니다. 주요 도형은 512px 기준 중심 반경 185px 안에 있어 maskable 안전 영역인 204.8px 이내입니다. 관리자 헤더 로고 설정을 변경해도 이미 설치된 앱 아이콘이 자동으로 바뀌지는 않습니다. 아이콘 변경은 PNG 파일 교체 후 재배포가 필요합니다.

## D. 수정한 기존 파일

- `index.html`, `mobile.html` — 메타데이터, 설치·업데이트 UI, defer, 새 스크립트 연결, 버전 표시
- `assets/ggfc-sync.js` — 캐시 안전장치·동일 snapshot 처리·SDK 연결 관리·상태 문구
- `assets/ggfc-cache.js` — 기존 등록 코드를 호환용 빈 파일로 전환. 새 등록 코드와 중복 실행하지 않음
- `service-worker.js` — 생성된 정적 캐시/업데이트 처리
- `tools/build-static-cache.py` — 변경 자산 해시 URL, 새 PWA 자산 포함, 템플릿 사용
- `README.md` — 최신 설치·업로드 안내

기존 파일을 삭제할 필요 없이 replacement ZIP의 동일 경로를 덮어쓸 수 있습니다.

## E. 정적 캐시 전략

| 대상 | 정책 | 이유 |
|---|---|---|
| HTML/CSS/JS/SVG/폰트/아이콘 | 검증된 릴리스 캐시에서 제공. worker 업데이트 시 전체 파일 목록을 백그라운드 검증 | 실행 중 HTML과 JS가 서로 다른 버전으로 섞이지 않도록 함 |
| 변경되지 않은 자산 | 이전 캐시의 실제 SHA-256이 같으면 재사용 | 폰트·대형 기능 JS 재다운로드 방지 |
| 변경된 자산 | 해시를 URL에 반영하고 새 파일 내려받아 검증 | JS/CSS 하나만 바뀌어도 새 worker 생성 |
| firebase-config.js | 저장된 설정 우선 + 서버 재확인. 없으면 서버 조회 | 재방문 때 설정 파일 대기로 UI가 늦어지는 현상 방지. DB snapshot은 아님 |
| Firebase·Auth·외부 CDN·사진 | Service Worker 캐시 대상 제외 | 데이터 최신성·인증·외부 파일 수명 보존 |
| html2canvas | 기존 지연 로딩, 일반 브라우저 캐시 사용 | 설치할 때 강제로 받지 않음 |

정적 파일마다 개별 SWR을 적용하면 새 HTML/옛 JS가 섞일 수 있어, **릴리스 단위로 검증 후 교체**하는 전략을 선택했습니다. 실행 파일은 현재 검증된 세트를 제공하고 worker를 백그라운드 갱신합니다. worker 등록은 load 후 1초에 시작합니다. 첫 방문에는 오프라인 준비를 위해 당장 표시하지 않는 메뉴 자산과 폰트도 백그라운드로 확보합니다.

검증 도중 파일이 없거나 해시가 맞지 않으면 새 설치를 취소하고 기존 정상 버전을 유지합니다. 업데이트는 자동 확인하되 적용은 사용자 선택입니다. 브라우저가 사용 중인 창이 모두 닫힌 상태에서는 표준 worker 수명주기에 따라 다음 실행에 새 버전이 적용될 수 있습니다.

activate에서 불필요한 이전 캐시를 정리합니다. 열려 있던 창의 늦은 요청을 보호하기 위해 최대 한 세대 이전 캐시를 일시 보존할 수 있으며 이후 활성화에서 정리됩니다. 이 앱의 경로별 캐시만 다루고 다른 사이트/프로젝트 캐시는 삭제하지 않습니다.

## F. Firebase 데이터와 PWA 캐시의 관계

- 서버 경로 `ggfc/v3`와 기존 records/players/settings/meta 구조, 인증 및 관리자 transaction 저장 절차를 유지했습니다.
- 정적 Cache Storage에는 경기 DB, 인증 토큰, 외부 선수 사진을 저장하지 않습니다.
- 마지막 정상 snapshot은 기존 DB URL별 localStorage 키를 사용합니다. 새 저장 형식은 `{cacheVersion:2, savedAt, appVersion, snapshot}`입니다.
- 기존 raw snapshot 캐시는 읽을 수 있으며 서버 재확인 때 새 형식으로 저장합니다. 레거시 캐시는 실제 저장 시각을 알 수 없으므로 데이터 자체의 검증 후 사용합니다.
- 180일은 **이 기기에서 서버 snapshot을 확인·저장한 시각** 기준입니다. 마지막 경기일이 오래됐다는 이유로 유효한 기록을 삭제하지 않습니다.
- 최초 캐시 표시·최신 확인·최신 기록·오프라인 상태를 구분합니다. 최근 정상 캐시가 있으면 연결 실패에도 그 기록을 계속 보여줍니다.
- 기존 요청대로 일반 동기화 상태는 페이지 맨 아래에 유지했습니다. 앱 업데이트 안내는 별도의 작은 하단 알림입니다.
- 온라인 여부, 서버 확인, 관리자 권한이 충족돼야 수정할 수 있습니다. 새로운 오프라인 편집 큐나 자동 병합 기능은 추가하지 않았습니다.
- Firebase 구성 파일을 변경하면 현재 열린 앱의 연결 대상이 즉시 바뀌지는 않습니다. 설정 파일을 서버에서 재확인한 뒤 다음 실행부터 적용됩니다.

## G. GitHub 업로드 및 업데이트

### 최초 적용: 현재 V3.25.39 사용 시

1. replacement ZIP을 압축 해제합니다. ZIP 파일 자체를 올리는 것이 아니라 **내부 파일·폴더를 같은 경로에** 올립니다.
2. `index.html`이 저장소 루트에 놓이도록 합니다. ZIP 이름의 상위 폴더 아래에 중복으로 넣지 않습니다.
3. 기존 `firebase-config.js`와 `database.rules.json`은 그대로 두세요. replacement에는 포함하지 않았습니다. FULL을 사용해도 현재 운영 설정을 보존하세요.
4. `assets`, `icons`, `tools`, `.github/workflows` 폴더도 함께 반영합니다. Windows에서 `.github` 폴더가 빠지지 않도록 확인하세요. 웹 업로더에서 빠지면 저장소의 Add file → Create new file로 `.github/workflows/pages.yml`을 만들고 같은 내용을 넣을 수 있습니다.
5. 파일을 모두 반영한 커밋 이후 배포가 끝나는지 확인합니다. 기존 Pages 배포 방식 그대로도 제공된 빌드 완료 파일을 사용할 수 있습니다.
6. **V3.25.39에서 최초 전환할 때** 기존 앱을 온라인에서 열어 새 버전을 받게 한 뒤, GGFC 관련 브라우저 탭과 설치 앱 창을 모두 닫고 다시 엽니다. 옛 worker에는 새 업데이트 버튼이 없으므로 이 전환 절차가 한 번 필요합니다. 아직 3.25.39라면 온라인에서 다시 연 후 잠시 기다리고 모든 창을 닫아 재실행합니다. 데이터 삭제/사이트 저장소 삭제는 필요하지 않습니다.
7. 하단 버전 **V3.25.40**, 사이드바 **앱 업데이트 확인**을 확인합니다. 엑셀은 다시 올리지 않아도 됩니다.

### 권장: 앞으로 JS/CSS만 수정해도 자동 배포되게 설정

1. GitHub 저장소 → Settings → Pages → Build and deployment → Source를 **GitHub Actions**로 지정합니다.
2. `.github/workflows/pages.yml`이 있어야 합니다. 기본 대상 브랜치는 `main`입니다. 실제 기본 브랜치가 다르면 workflow의 branches를 맞춥니다.
3. 이후 파일을 수정하고 main에 커밋하면 `Build verified release → Validate → Stage → Deploy` 순서로 실행합니다.
4. 화면 버전도 올리고 싶으면 `app-version.json`의 version을 변경합니다. 버전 문자열을 그대로 둔 채 CSS만 바꿔도 콘텐츠 해시가 바뀌어 worker 업데이트는 감지합니다.
5. Actions 탭에서 GGFC Pages 배포가 완료된 후 앱에서 **앱 업데이트 확인 → 업데이트**를 누릅니다.

빌드 결과의 해시·worker는 배포 artifact에서 생성됩니다. workflow는 저장소에 생성 파일을 역으로 커밋하지 않습니다. 나중에 브랜치 직접 배포로 되돌릴 경우 아래 빌드를 다시 실행한 출력 파일을 함께 업로드해야 합니다. 기존에 별도 workflow가 있다면 같은 Pages 대상을 동시에 배포하지 않도록 하나만 사용하세요. 이번 작업에서 실제 GitHub 설정 변경이나 배포는 수행하지 않았습니다.

### 자동 workflow를 사용하지 않을 때

변경 후 다음을 실행하고 수정 파일과 새 `service-worker.js`, HTML을 함께 업로드합니다.

```bash
python3 tools/build-static-cache.py --version 3.25.41
python3 tools/check-release.py
```

Python 3와 Node.js가 필요합니다. Python 외부 패키지는 필요하지 않습니다. 해시 목록을 갱신하지 않고 서버 JS/CSS만 바꾸면 안전 검증 때문에 새 버전이 적용되지 않을 수 있습니다.

### 회원에게 업데이트가 도착하는 시점

접속 시 브라우저 worker 확인, 앱이 다시 보일 때 확인(최소 1분 간격), 화면을 열어 둔 동안 15분 간격, 온라인 복귀 및 **앱 업데이트 확인** 버튼으로 확인합니다. GitHub 배포/CDN 전파와 다운로드가 끝나야 알림이 나옵니다. 푸시 알림 서비스나 즉시 전원 강제 갱신 방식은 아닙니다.

**GitHub 커밋 → Actions 빌드/검증 → Pages 배포 → 앱 새 버전 검증 → 안내 → 사용자 업데이트 → 새 앱 로드**

## H. 오프라인 범위

| 가능 | 제한 |
|---|---|
| 이전 온라인 접속에서 캐시 설치를 완료한 앱 UI | 첫 방문/저장 공간에서 캐시가 제거된 기기의 오프라인 시작 |
| 마지막 정상 snapshot으로 메뉴·통계 조회 | 새 경기 데이터 확인 |
| 캐시에 포함된 폰트·카드 SVG 사용 | 미저장 외부 선수 사진·CDN 파일 최초 로딩 |
| 온라인 복귀 후 최신 Firebase 재연결 | 오프라인 관리자 수정·새로운 자동 병합 |

앱 저장과 기록 저장은 서로 다릅니다. 정적 앱은 있어도 snapshot이 없으면 기록을 표시할 수 없습니다. 네트워크가 끊긴 상태에서 캐시에 없는 html2canvas를 처음 사용하면 이미지 저장이 되지 않을 수 있습니다. 브라우저가 저장 공간을 회수할 수 있으므로 완전한 영구 오프라인 DB 앱으로 보장하지 않습니다.

## I. 첫 방문 / 재방문 측정

측정: 로컬 Chromium, 390×844, CPU/네트워크 제한 없음, 실제 엑셀 fixture, Firebase 응답을 시험 서버에서 1,500ms 지연. 앱 표시 비교는 Service Worker를 끄고 독립 cold/warm 3회 중앙값을 사용했습니다. 아래 시간은 실제 GitHub Pages/Firebase/Android 측정값이 아닙니다.

| 항목 | V3.25.39 | V3.25.40 |
|---|---:|---:|
| 첫 방문 HTML 수신 완료 | 3.4ms | 3.9ms |
| 최초 HTML이 요청한 JS/CSS 개수 | 13 | 14 |
| 최초 JS/CSS 원본 크기 | 1,289,734 bytes | 약 1,299KB |
| 첫 방문 최신 기록 표시 | 1,811.5ms | 1,818.4ms |
| 재방문 저장된 기록 표시 | 231.7ms | 231.9ms |
| 재방문 최신 데이터 확인/적용 완료 | 2,201.3ms | 2,079.5ms |
| 같은 snapshot 다시 수신 시 renderAll | 수행 | 0회 |

초기 화면은 이미 빠른 캐시 표시가 구현돼 있어 이번 비교에서는 사실상 동일했습니다. 설치·업데이트 기능으로 작은 CSS/JS가 추가되며 첫 방문 다운로드량이 줄어든 버전은 아닙니다. 마지막 행처럼 불필요한 재계산을 없애고 정적 재다운로드를 억제하는 데 의미가 있습니다. 약 0.12초의 최신화 차이는 이 시험 환경의 결과이며 일반적인 개선률로 보장하지 않습니다.

별도 실제 Service Worker 브라우저 시험에서는 `/ggfc-record/` 하위 경로에서 재방문 기능 JS/CSS의 worker 제공을 확인했습니다. 저장된 기록은 237ms에 표시됐고, 시험 Firebase 최신화는 1,870ms에 완료됐습니다. JS 하나를 바꾼 업데이트에서 기존 폰트·Squad JS는 다시 받지 않았습니다. 이 시험 역시 시험 서버 응답 지연을 포함하며 실서버 속도와 구분합니다.

실제 Firebase 네트워크 시간, 실제 휴대폰 체감 속도, Lighthouse Performance/Accessibility 점수는 **측정 불가**입니다. Lighthouse 실행 도구와 Android 실기기가 없는 환경이므로 점수를 추정하지 않았습니다.

## J. 기존 기능 회귀 테스트

- V3.25.39와 V3.25.40을 동일 시간·동일 엑셀 자료로 실행해 17개 메뉴의 텍스트 출력과 렌더링 후 DB 결과를 비교했습니다. 버전 표기를 제외한 결과가 같았습니다.
- 전체 70명 선수의 능력치 객체가 일치했습니다. BASE/FORM/LONG FORM/CURRENT 등의 산식을 변경하지 않았습니다.
- Team Squad 66명의 OVR·6개 축·BASE 비교, 과거 기준일, 작은 카드와 팝업 값 일치 검증을 통과했습니다.
- Overview 출력의 득점자 7.35px·팀명 13.5px와 12개 대진, 실제 html2canvas PNG 생성 및 잘림 여부를 확인했습니다. 출력 로직은 그대로입니다.
- 17개 메뉴의 모바일 스와이프: 드래그 중 재계산 없음, 되돌아갈 때 준비된 화면 재사용, 취소/방향 전환/세로 스크롤/가로 표/설정 변경/화면 크기 변경 검증을 통과했습니다.
- 이름/표 등 각 화면 기능과 관리자 설정의 계산 JS 9개 파일이 원본과 동일합니다.
- 엑셀 import fixture와 JSON/Firebase split→merge 왕복 결과를 검증했습니다.
- 관리자 저장: 기존 transaction의 revision 확인·성공 처리·캐시 저장을 **시험용 Firebase 구현**으로 통과했습니다. 운영 Firebase에 저장하지 않았습니다.
- 동시 회원 조회는 로컬 브라우저 2개에서 같은 revision 조회를 확인했습니다. 100명 부하 시험은 하지 않았습니다.

| 요청 시나리오 | 결과 |
|---|---|
| 1 첫 방문, 2 재방문 | 통과: 캐시 우선 + 서버 최신화 |
| 3 JS 변경, 4 CSS 변경 | 통과: 새 worker 감지 → 사용자 적용 |
| 5 캐시/업데이트 충돌 | 통과: 미완성 파일 해시 거부, 기존 정상 버전 유지 |
| 6 인터넷 단절, 7 Firebase만 실패 | 통과: 저장 기록 유지, 관리자 수정 차단 |
| 8 손상 캐시 | 통과: JSON 손상·기간 초과·형식 불일치 제거 후 서버 복구 |
| 9 관리자 저장 | 시험 Firebase로 통과, 실서버 미실행 |
| 10 동시 회원 | 시험 브라우저 2개 통과, 실서비스 부하 미측정 |
| 11 Android 설치 | 설치 이벤트·선택·설치 후 숨김 자동시험, 실기기 미실행 |
| 12 설치 후 업데이트 | 동일 PWA worker 경로에서 검증, Android 실설치 상태의 시험은 미실행 |
| 13 PC/mobile 진입 | 통과: 상대경로·?view=desktop 유지 |
| 14 스와이프 | 17개 메뉴 통과 |
| 15 이미지 저장 | html2canvas 초기 요청 0회·동시 필요 요청 1회, 실제 PNG 생성 통과 |

## K. 회원용 PWA 설치 방법과 TWA 준비

### Android Chrome

1. Chrome에서 GGFC의 기존 HTTPS 주소를 엽니다.
2. 기록 표시와 앱 저장이 끝난 뒤 왼쪽 위 메뉴를 엽니다.
3. **GGFC를 앱으로 설치**를 누르고 설치를 선택합니다.
4. 설치 버튼이 표시되지 않으면 Chrome 메뉴의 **앱 설치** 또는 **홈 화면에 추가** 항목을 이용합니다. 표시 이름은 Chrome 버전에 따라 다를 수 있습니다.
5. 홈 화면의 **GGFC** 아이콘을 눌러 실행합니다.
6. **GGFC 새 버전이 있습니다**가 나오면 작업을 마친 뒤 업데이트를 누릅니다.

이미 설치돼 standalone으로 실행 중이면 설치 버튼을 숨깁니다. 브라우저가 beforeinstallprompt를 제공하지 않는 경우 버튼을 강제로 노출하지 않습니다. Android 실제 설치 UI·런처·뒤로가기 하드웨어는 이 환경에서 검증하지 못했습니다. 웹 브라우저의 hash history 뒤로가기는 시험했습니다.

### 향후 Google Play TWA

HTTPS 배포, manifest, 상대 scope/start_url/id, standalone, maskable 아이콘, worker 구조를 준비했습니다. APK/AAB나 Google Play 앱은 만들지 않았습니다.

TWA 검증 파일은 **사이트 원점의 `/.well-known/assetlinks.json`**에 있어야 합니다. GitHub 프로젝트 경로가 `/ggfc-record/`라면 그 폴더 아래 `.well-known`만 추가하는 것으로는 충분하지 않습니다. 추후 사용자 루트 Pages 저장소 또는 별도 도메인에서 원점 루트를 관리하고, 실제 Android package name과 서명 인증서 SHA-256을 넣어야 합니다. 가짜 값의 assetlinks 파일은 넣지 않았습니다.

## L. 코드 / 경로 / 설치 검사

- 모든 실행 JS와 Firebase config의 `node --check` 통과.
- index/mobile/offline HTML의 중복 ID·로컬 참조 경로 검사 통과.
- manifest JSON, 상대 scope/start_url, any/maskable PNG 크기 검사 통과. Chromium의 Page.getAppManifest 파싱 오류 0개. standalone 감지 분기는 모의 상태로 검증.
- 로컬 보안 컨텍스트로 취급되는 localhost에서 실제 Service Worker 등록·설치·활성화·캐시 응답 확인.
- `/ggfc-record/` 프로젝트 하위 경로에서 앱/worker/아이콘 요청 확인. 원점 `/`로 이동하지 않음.
- V3.25.39의 실제 worker와 레거시 raw snapshot에서 새 버전으로 전환하는 브라우저 시험 통과.
- 파일별 SHA-256과 생성 캐시 목록 검증 통과. 빌드 재실행은 같은 입력에서 동일한 결과를 생성.
- 정상 업데이트, 손상 업데이트, 오프라인, 캐시 오류, 외부 라이브러리 실패 복구에서 JS 런타임 오류 없음.
- FULL 및 replacement ZIP의 CRC와 포함 파일 해시 검사 통과.
- 물리 Android 설치, 실서비스 Pages 배포, 실 Firebase 관리자 쓰기, Lighthouse 정량 점수는 실행하지 않음.

## M. FULL 사용

FULL은 V3.25.40 전체 실행 소스와 운영 문서·빌드 도구를 포함합니다. 현재 운영 중인 Firebase config/rules 값은 유지하세요. 검증용 엑셀·DB snapshot·테스트 스크린샷은 배포 ZIP에 포함하지 않았습니다.

## N. replacement-only 사용

V3.25.39와 비교해 추가되거나 달라진 파일만 포함합니다. 변경 없는 계산 모듈, 선수 사진, 설정·규칙 파일은 들어 있지 않습니다. V3.25.38 이하에 바로 부분 적용하지 말고 이 경우 FULL을 사용하세요.

## 참고한 공식 문서

- Service Worker 수명주기와 skipWaiting 주의: https://web.dev/articles/service-worker-lifecycle
- PWA 업데이트: https://web.dev/learn/pwa/update/
- GitHub Pages custom workflow: https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages
- Android TWA 및 Digital Asset Links: https://developer.android.com/develop/ui/views/layout/webapps/guide-trusted-web-activities-version2
