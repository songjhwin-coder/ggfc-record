# GGFC 3.18.1 · 비밀번호 관리자 버전 배포 안내

관리자는 홈페이지에서 **비밀번호 하나만 입력**해 기록과 설정을 관리합니다. 회원은 로그인 없이 링크로 열람합니다. PC와 휴대폰은 같은 기록을 사용합니다.

GitHub는 홈페이지 파일을 제공하고, Firebase는 기록 저장과 비밀번호 확인을 담당합니다. 홈페이지의 Google 로그인과 관리자 UID 등록 절차는 제거했습니다. **Firebase에 처음 한 번 비밀번호를 등록하고 제공한 규칙을 적용하는 초기 설정은 필요합니다.**

이 안내는 PC의 Chrome 또는 Edge에서 설정하는 기준입니다. 완성된 홈페이지는 회원 휴대폰에서도 이용할 수 있습니다. 아직 실제 GitHub 게시나 Firebase 콘솔 설정은 진행하지 않았습니다.

## 1. 먼저 압축 풀기

1. `GGFC_V3_18_1_GitHub_Password_PC_Mobile.zip`을 다운로드합니다.
2. Windows 탐색기에서 ZIP 파일을 마우스 오른쪽 버튼으로 눌러 **모두 추출**을 선택합니다.
3. 압축을 푼 폴더를 엽니다. 바로 안쪽에 `index.html`과 `assets` 폴더가 보이는 위치를 찾습니다.
4. 아래 파일 구성을 확인합니다. `assets` 안에는 네 개의 파일이 있어야 합니다.

| 위치 | 파일 | 역할 |
|---|---|---|
| 최상위 | `index.html` | 공통 홈페이지. 작은 화면에서는 모바일 UI 자동 적용 |
| 최상위 | `mobile.html` | 모바일 화면으로 바로 접속하는 페이지 |
| 최상위 | `firebase-config.js` | 제공하신 Firebase 프로젝트 설정과 실제 데이터베이스 주소 |
| `assets` 폴더 안 | `ggfc-app.js` | 경기·선수·능력치·엑셀 처리 |
| `assets` 폴더 안 | `ggfc-sync.js` | 비밀번호 로그인과 공유 저장 |
| `assets` 폴더 안 | `ggfc-mobile.js` | 모바일 메뉴와 카드 |
| `assets` 폴더 안 | `ggfc.css` | 화면 디자인 |
| 최상위 | `database.rules.json` | Firebase 콘솔에 적용할 권한 규칙 |

ZIP 파일 자체를 GitHub에 올리는 방식이 아닙니다. 압축을 푼 내용물을 올려야 합니다. `index.html`만 올려도 작동하지 않으므로 `assets` 폴더를 함께 올립니다.

이 패키지에는 실제 선수 기록을 넣지 않았습니다. 기존 Firebase의 `ggfc/v3` 기록이 있으면 연결 후 읽습니다. 기록이 없으면 홈페이지를 연 뒤 관리자가 최신 통합 엑셀이나 기존 JSON을 가져옵니다.

## 2. Firebase에 처음 한 번 비밀번호 등록하기

### 2-1. 관리자 비밀번호 만들기

1. [Firebase 콘솔](https://console.firebase.google.com/)을 열고 기존 **`ggfc-database` 프로젝트**를 선택합니다.
2. 왼쪽 메뉴에서 **Authentication(인증)**을 엽니다. 콘솔 구성에 따라 Security 그룹 안에 표시될 수 있습니다.
3. 처음 사용하는 화면이면 시작 버튼을 누릅니다.
4. **Sign-in method(로그인 방법)**에서 **Email/Password(이메일/비밀번호)**를 선택합니다.
5. **이메일/비밀번호 사용**을 켜고 저장합니다. 이메일 링크 로그인 옵션은 사용하지 않습니다.
6. **Users(사용자)** 탭에서 **Add user(사용자 추가)**를 누릅니다.
7. 이메일 칸과 비밀번호 칸에 아래와 같이 입력하고 사용자를 추가합니다.

| 입력칸 | 입력할 값 |
|---|---|
| 이메일 | `ggfc-admin@example.com` — 그대로 입력 |
| 비밀번호 | 본인이 사용할 관리자 비밀번호 |

이 이메일 모양의 값은 프로그램 내부에서 사용하는 고정 로그인 ID입니다. 실제 이메일 수신이나 Google 계정 연동에 쓰지 않습니다. **홈페이지에서는 이 ID를 입력하지 않고 비밀번호만 입력합니다.** 기본 비밀번호는 제공하지 않으며, 지금 등록한 비밀번호가 관리자 비밀번호가 됩니다.

다른 회원에게는 비밀번호를 알려주지 않고 홈페이지 주소만 공유합니다. 비밀번호를 아는 사람은 같은 관리자 권한으로 기록을 변경할 수 있습니다. 홈페이지에는 회원가입 기능이 없습니다. 관리자용 고정 ID는 파일을 공개하기 전에 먼저 생성하세요. [Firebase 비밀번호 로그인 안내](https://firebase.google.com/docs/auth/web/password-auth), [콘솔에서 사용자 생성](https://firebase.google.com/docs/auth/web/manage-users)

### 2-2. 실제 기록 저장 주소 넣기

1. Firebase 콘솔에서 **Realtime Database**를 엽니다. Firestore가 아닙니다.
2. 이미 데이터베이스가 있으면 기존 것을 사용합니다. 아직 없으면 **Create database(데이터베이스 만들기)**를 눌러 생성하고, 초기 보안 모드는 잠금 모드로 시작합니다.
3. **Data(데이터)** 탭 상단에 표시된 데이터베이스 URL을 복사합니다.
4. 압축을 푼 폴더에서 `firebase-config.js`를 마우스 오른쪽 버튼으로 눌러 **연결 프로그램 → 메모장**으로 엽니다.
5. 아래 줄의 빈 따옴표 안에 복사한 주소를 붙여 넣고 저장합니다.

```javascript
"databaseURL": ""
```

주소는 보통 `https://…firebaseio.com` 또는 `https://…firebasedatabase.app` 형태입니다. **예시를 추측해서 입력하지 말고 콘솔에서 복사한 실제 주소를 사용하세요.** 다른 Firebase 설정값은 이미 보내주신 프로젝트 값으로 입력되어 있습니다. 비밀번호는 이 파일에 쓰지 않습니다. [Realtime Database 연결 안내](https://firebase.google.com/docs/database/web/start)

### 2-3. 제공한 규칙 붙여 넣기

1. 기존 기록이 있다면 Realtime Database의 데이터를 JSON으로 내보내어 보관합니다.
2. `database.rules.json`을 메모장으로 열어 전체 내용을 복사합니다.
3. Firebase **Realtime Database → Rules(규칙)**에 붙여 넣습니다.
4. **Publish(게시)**를 눌러 적용합니다.

이 규칙은 누구나 공유 기록을 읽게 하고, 위에서 만든 고정 관리자 ID로 비밀번호 인증을 마친 경우에만 저장을 허용합니다. 브라우저의 화면 잠금과 별도로 Firebase 서버에서 검사합니다. `ggfc/admins`에 UID를 추가할 필요는 없습니다. **규칙 파일을 GitHub에 올리는 것만으로 Firebase에 적용되지는 않습니다.** [Realtime Database 권한 조건](https://firebase.google.com/docs/database/security/rules-conditions)

## 3. GitHub에 홈페이지 저장소 만들기

이미 GGFC용 저장소가 있다면 6번의 기존 홈페이지 교체 방법으로 이동하세요.

1. [GitHub](https://github.com/)에 접속합니다. 계정이 없으면 가입하고 이메일 확인을 마친 뒤 로그인합니다.
2. 오른쪽 위 **+ → New repository**를 선택합니다. 또는 [새 저장소 만들기](https://github.com/new)를 엽니다.
3. 아래와 같이 입력합니다.

| 항목 | 선택 또는 입력 |
|---|---|
| Owner | 본인 GitHub 계정 |
| Repository name | `ggfc-record` |
| Description | 선택 사항. 예: `GGFC 경기·선수 기록센터` |
| 공개 범위 | **Public** |
| README 추가 | 체크하여 저장소 초기화 |

4. **Create repository**를 누릅니다.
5. 저장소의 **Code** 화면이 열리면 생성이 완료된 것입니다.

GitHub Free에서 Pages를 쓰는 이 안내는 공개 저장소 기준입니다. 저장소 이름은 다른 이름으로 정해도 되며, 그 이름은 홈페이지 주소에 들어갑니다. [GitHub Pages 사이트 만들기](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site)

## 4. 파일과 폴더 업로드하기

1. 방금 만든 저장소의 **Code** 탭을 엽니다.
2. 파일 목록 위 **Add file → Upload files**를 누릅니다.
3. 탐색기에서 압축을 푼 폴더를 엽니다.
4. `index.html`, `mobile.html`, `firebase-config.js`, **`assets` 폴더**를 선택해 GitHub의 업로드 영역으로 끌어 놓습니다. 안내 문서와 규칙 파일을 함께 올려도 됩니다.
5. 업로드 목록에서 `assets/ggfc-app.js`처럼 폴더 이름이 포함되어 있는지 확인합니다.
6. Commit message에 `GGFC 비밀번호 관리자 버전 게시`라고 입력합니다.
7. 본인 저장소에서 직접 커밋할 수 있으면 **main 브랜치에 직접 반영**을 선택하고 커밋 버튼을 누릅니다.
8. 새 브랜치를 만드는 화면이면 변경 제안 후 Pull request를 만들고 **Merge pull request**로 `main`에 합칩니다. Pages가 `main`을 게시하도록 설정되어 있으므로 파일이 최종적으로 그 브랜치에 있어야 합니다.

최상위 파일 목록에 **`index.html`이 바로 보이면** 위치가 맞습니다. 압축을 푼 바깥 폴더를 통째로 올려 `GGFC_V3_18_1…/index.html`처럼 한 단계 안쪽에 들어가지 않도록 합니다. [GitHub 웹에서 파일·폴더 업로드](https://docs.github.com/en/repositories/working-with-files/managing-files/adding-a-file-to-a-repository)

## 5. GitHub Pages 배포 켜기

1. 저장소 상단 **Settings**를 누릅니다. 계정 전체 설정이 아니라 `ggfc-record` 저장소의 설정입니다.
2. 왼쪽 메뉴에서 **Pages**를 엽니다.
3. **Build and deployment** 영역을 다음과 같이 설정합니다.

| 항목 | 선택 |
|---|---|
| Source | **Deploy from a branch** |
| Branch | **main** — 파일을 업로드한 기본 브랜치 |
| Folder | **/(root)** |

4. 저장합니다. `/docs` 폴더를 선택하지 않습니다.
5. 저장소의 **Actions** 탭에서 Pages 배포 작업을 확인합니다. 초록색 체크가 표시되면 작업이 완료된 것입니다. 빨간색 실패 표시가 있으면 해당 작업을 열어 오류를 확인합니다.
6. 다시 **Settings → Pages**로 돌아가 실제 사이트 주소 또는 사이트 방문 버튼을 확인합니다. 변경이 반영되기까지 몇 분 걸릴 수 있습니다.
7. **Enforce HTTPS** 항목이 표시되고 선택 가능하면 켭니다.

GitHub 공식 안내는 Pages를 비밀번호 전송 같은 민감한 용도로 사용하는 것을 권장하지 않습니다. 이 코드의 비밀번호 확인은 Firebase에 직접 요청하지만, 운영 시 관리자 화면은 Firebase Hosting 등 인증 화면을 제공하기에 적합한 호스팅에 두는 방식을 권장합니다. 위 Pages 절차는 요청하신 파일 게시 방법을 설명합니다. [GitHub의 용도 안내](https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https)

이 프로그램은 HTML·CSS·JavaScript 파일로 구성되어 있어 npm 설치나 별도 빌드 명령이 필요하지 않습니다. 사용자 지정 도메인을 입력하지 않아도 GitHub에서 제공하는 주소로 사용할 수 있습니다. [게시 브랜치 설정](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site), [Pages의 HTTPS](https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https)

주소의 형태는 아래와 같습니다. `YOUR_ACCOUNT`는 본인 GitHub 계정명으로 바꿉니다. 아래 주소는 설명용 예시이며 실제로 게시된 주소는 아닙니다.

| 용도 | 주소 형식 |
|---|---|
| 회원에게 공유할 공통 주소 | `https://YOUR_ACCOUNT.github.io/ggfc-record/` |
| 모바일 화면 바로 열기 | `https://YOUR_ACCOUNT.github.io/ggfc-record/mobile.html` |
| PC 화면 고정 | `https://YOUR_ACCOUNT.github.io/ggfc-record/index.html?view=desktop` |

`github.com/계정/저장소`는 파일을 관리하는 화면입니다. **회원들에게 공유할 것은 `계정.github.io`로 시작하는 Pages 홈페이지 주소**입니다.

## 6. 이미 올린 홈페이지를 새 버전으로 교체하기

1. 기존 홈페이지에서 최신 기록을 JSON으로 내보내어 보관합니다.
2. 기존 `firebase-config.js`에 입력한 `databaseURL`이 있다면 새 파일에도 그대로 옮깁니다.
3. 2번 절차로 비밀번호용 관리자 사용자를 만들고 새 규칙을 적용합니다. 이 작업은 Google 로그인 버전에서 처음 전환할 때 필요합니다.
4. 기존 GitHub 저장소의 `main` 브랜치에서 새 파일을 같은 경로에 업로드하여 교체합니다.
5. 기존 선수 사진이 들어 있는 `images` 폴더는 유지합니다. 기존 Firebase의 경기 데이터를 지우거나 새 프로젝트를 만들 필요는 없습니다.
6. Pages 배포 완료 후 브라우저를 새로고침합니다. PC에서 이전 화면이 남으면 `Ctrl + Shift + R`로 다시 불러옵니다.

새 화면에서 로그인 입력칸이 비밀번호 하나이고, 모바일 더보기 메뉴의 버전이 **3.18.1**인지 확인합니다. 새 규칙에서는 이전 Google 관리자 로그인 방식으로 저장할 수 없으므로 새 파일과 규칙을 함께 적용하세요.

## 7. 최초 로그인과 기록 업로드

1. 배포된 홈페이지 주소를 엽니다.
2. 오른쪽 위 **관리자 로그인**을 누릅니다. 모바일에서는 더보기 메뉴에서도 열 수 있습니다.
3. Firebase에 등록한 **비밀번호만 입력**하고 로그인합니다.
4. **데이터 관리 → 통합 기록지 업로드**를 눌러 최신 엑셀을 선택합니다. 기존 프로그램의 기록·설정까지 이전하려면 **JSON 가져오기**를 사용합니다.
5. 상단에 **공유 저장 완료**가 표시되는지 확인합니다.
6. 다른 휴대폰에서 로그인하지 않고 같은 주소를 열어 경기 기록, 선수 이름·사진, 대표승점과 능력치가 보이는지 확인합니다.
7. 홈페이지 표시명을 잠깐 변경해 저장한 뒤, 회원 화면에서도 자동으로 바뀌는지 확인하고 원래 값으로 돌려놓습니다.

이후에는 관리자가 홈페이지에서 엑셀을 올리거나 설정을 저장하면 됩니다. **경기 기록을 바꿀 때마다 GitHub에 파일을 다시 올릴 필요는 없습니다.** 프로그램 코드·디자인을 바꿀 때만 GitHub 파일을 교체합니다.

통합 엑셀에 경기 시트가 있으면 그 파일의 경기 기록으로 현재 목록을 교체합니다. 여러 시즌을 유지하려면 그 시즌의 기록을 모두 담은 통합 파일을 올리세요. 관리자 설정의 입력칸을 변경한 뒤에는 해당 화면의 저장 버튼을 눌러야 합니다.

## 8. 선수 사진 올리기

1. GitHub 저장소에 `images` 폴더를 만들거나, PC에서 사진을 담은 `images` 폴더를 업로드합니다.
2. 파일 이름은 구분하기 쉽게 `player-01.jpg`, `player-02.jpg`처럼 정합니다.
3. 엑셀 **선수명단 Draft → 사진(URL)** 칸에 `images/player-01.jpg`처럼 입력합니다.
4. 수정한 엑셀을 홈페이지에서 다시 업로드하고 공유 저장 완료를 확인합니다.

사진 파일 이름의 대소문자와 확장자가 실제 파일과 같아야 합니다. 한 장을 가로 600px 안팎으로 줄이면 휴대폰 로딩에 도움이 됩니다. HTTPS 이미지 주소나 엑셀의 외부 하이퍼링크도 사용할 수 있지만, Google Drive·Dropbox 등 외부 서비스의 비공개 파일이나 이미지 직접 표시 제한은 프로그램에서 해제할 수 없습니다. 셀 위에 붙인 그림 자체는 URL로 인식하지 않습니다.

## 9. 문제가 생겼을 때

| 보이는 현상 | 확인할 내용 |
|---|---|
| 404 페이지 | Pages의 브랜치·폴더 설정, 최상위 `index.html`, Actions 배포 완료 여부 |
| 글씨만 나오고 디자인이 없음 | `assets` 폴더가 빠지거나 다른 위치에 올라갔는지 확인 |
| 공유 기록 연결 준비 중 | `firebase-config.js`의 `databaseURL` 입력 여부 확인 |
| 비밀번호가 올바르지 않음 | Authentication에 고정 ID와 비밀번호를 등록했는지, 입력 비밀번호가 맞는지 확인 |
| 로그인 사용 설정 안내 | Email/Password 로그인 방식이 활성화되어 있는지 확인 |
| 로그인은 되지만 저장 실패 | 새 `database.rules.json`을 Realtime Database의 Rules에서 게시했는지 확인 |
| 승인되지 않은 도메인 오류 | Authentication의 Settings → Authorized domains에 `본인계정.github.io` 추가. `https://`와 저장소 경로는 제외 |
| 회원 폰에 예전 기록이 남음 | 관리자 화면의 공유 저장 완료 표시, 두 기기의 인터넷 연결, 서로 같은 Pages 주소인지 확인 |
| 선수 사진이 없음 | 엑셀 사진 URL, GitHub 파일 경로·대소문자, 외부 파일의 공개 여부 확인 |
| 다른 관리자 수정 안내 | 미저장 내용을 내려받고 서버 기록을 다시 받은 뒤 필요한 변경만 재적용 |

로컬 HTML 파일을 더블클릭해서 보는 것과 실제 Pages 주소에서 로그인·공유하는 것은 다릅니다. 최종 운영 확인은 `https://…github.io/…` 주소에서 진행하세요. 이 앱이 직접 저장하는 기록·JSON·설정에는 관리자 비밀번호를 넣지 않습니다.

### 관리자 비밀번호를 잊은 경우

고정 ID는 로그인 식별용이며 실제 이메일을 받지 않으므로 이메일로 비밀번호 재설정을 받는 방식은 사용하지 않습니다. 초기화를 해야 한다면 프로젝트 소유자가 Firebase 콘솔에서 다음 순서로 처리할 수 있습니다.

1. Realtime Database 규칙의 `ggfc → v3 → .write` 값만 임시로 `false`로 바꾸어 게시합니다. 기록 자체는 지우지 않습니다.
2. Authentication의 Users에서 `ggfc-admin@example.com` 사용자만 삭제하고, 같은 ID와 새 비밀번호로 다시 만듭니다.
3. 패키지의 규칙을 다시 게시합니다.
4. 홈페이지에서 새 비밀번호로 로그인합니다.

프로젝트 소유자 계정을 잃어버린 경우에는 Firebase 콘솔 접근부터 복구해야 합니다. [Firebase 사용자 관리](https://firebase.google.com/docs/auth/web/manage-users)

## 10. 무료 사용과 검증 범위

이 구성은 GitHub Free의 공개 저장소 + GitHub Pages + Firebase Spark의 이메일/비밀번호 인증·Realtime Database를 사용합니다. 무료 한도 내에서 운영하는 구성이며 무제한은 아닙니다. Firebase의 유료 Cloud Storage 업로드, Cloud Functions, 문자 인증 기능은 사용하지 않습니다. [GitHub Pages 안내](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages), [Firebase 요금표](https://firebase.google.com/pricing)

실제 데이터베이스 주소는 아직 전달받지 않아 설정 파일의 주소란을 비워 두었습니다. GitHub 게시, 관리자 사용자 생성, 실제 서버 규칙 적용, 실기기 로그인·동기화는 진행하지 않았습니다. 코드와 모의 환경의 로그인·저장 동작을 확인한 배포 준비본이며, 7번 절차의 실제 기기 확인을 마친 뒤 회원에게 공유하세요.
