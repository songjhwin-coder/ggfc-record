# GGFC V3.25.4 최종 정리본

기존 160개 파일을 84개로 정리했습니다. 기능과 실행 코드는 V3.25.4와 동일합니다.

## 구성 (폴더를 제외한 실제 파일 수)
- 최상위 5개: index.html, mobile.html, firebase-config.js, database.rules.json, README.md
- assets 바로 아래 17개: 현재 실행 코드·스타일 및 카드 이미지
- assets/fonts 4개: 이미지 출력 폰트 2개와 필수 라이선스 2개
- assets/player-cutouts 58개: 선수 투명 사진 원본

## 기존 GitHub 저장소에 적용
1. 기존 파일을 백업합니다.
2. index.html과 mobile.html을 이 정리본으로 교체합니다.
3. 기존 assets 폴더는 이 정리본의 assets 폴더 구성으로 교체합니다. 단순히 덮어쓰기만 하면 이전 버전 파일은 남으므로, 아래 삭제 가능한 파일 목록도 정리해야 실제 파일 수가 줄어듭니다.
4. 현재 사용 중인 firebase-config.js 및 Firebase 보안 규칙은 유지하세요. 정리본의 두 파일은 기준 소스에 있던 파일을 그대로 보관한 것입니다. 파일 정리를 위해 인증이나 보안 규칙을 변경할 필요가 없습니다.
5. 루트 폴더의 오래된 업데이트 안내문과 docs는 실행에 사용되지 않습니다. 필요한 운영 자료는 저장소 밖에 백업한 후 아래 목록을 기준으로 정리할 수 있습니다. 별도로 추가한 CNAME, .github 등 호스팅 설정이나 사용자 파일은 이 삭제 목록에 없으므로 유지하세요.
6. 압축 파일 자체가 아니라 압축 해제한 내용물을 저장소 최상위에 적용하세요. 이번 정리본은 전체 구성이고 추가 교체용 ZIP은 필요하지 않습니다.

사진은 assets/player-cutouts 경로에 유지하세요. 기존 58개 사진을 이미 올렸다면 재업로드할 필요가 없습니다. 새로 올리는 경우 프로그램 파일과 사진 폴더를 나누어 업로드해도 됩니다.

## 유지해야 하는 구버전 이름 파일
assets/ggfc-duo-v3.22.0.js는 최신 페이지에서 실제로 불러오는 DUO 분석 코드입니다. 버전 이름만 보고 삭제하지 마세요.

## 사커비 새 양식
관리자 → 능력치 운영 안내 → 사커비 DB 업로드에서 등록합니다. 경기순번·출전시간·거리 및 스프린트 평가를 지원합니다. 새 설정에 대한 자세한 설명은 프로그램 안의 능력치 운영 안내 메뉴에 있습니다.

## 기존 V3.25.4 패키지에서 제외한 77개 파일
기존 README.md를 새 정리 안내문으로 교체하므로 전체 파일 수는 76개 감소합니다. 아래 목록은 확인한 기준 패키지에서 제외한 파일이며, 서버에서 자동 삭제하거나 배포하지 않았습니다.

- `GitHub_배포_상세가이드.html`
- `README.md`
- `README_배포안내.md`
- `assets/ggfc-app-v3.21.12.js`
- `assets/ggfc-app-v3.22.0.js`
- `assets/ggfc-app-v3.23.0.js`
- `assets/ggfc-app-v3.23.1.js`
- `assets/ggfc-app-v3.24.0.js`
- `assets/ggfc-app-v3.24.1.js`
- `assets/ggfc-app-v3.24.2.js`
- `assets/ggfc-app-v3.25.1.js`
- `assets/ggfc-app-v3.25.2.js`
- `assets/ggfc-app-v3.25.3.js`
- `assets/ggfc-app.js`
- `assets/ggfc-card-design-v3.25.1.js`
- `assets/ggfc-card-design-v3.25.2.js`
- `assets/ggfc-card-design-v3.25.3.js`
- `assets/ggfc-squad-v3.23.0.js`
- `assets/ggfc-squad-v3.23.1.js`
- `assets/ggfc-squad-v3.23.2.js`
- `assets/ggfc-squad-v3.24.0.js`
- `assets/ggfc-squad-v3.24.1.js`
- `assets/ggfc-squad-v3.24.2.js`
- `assets/ggfc-squad-v3.25.1.js`
- `assets/ggfc-squad-v3.25.2.js`
- `assets/ggfc-squad-v3.25.3.js`
- `assets/ggfc-v3.21.12.css`
- `assets/ggfc-v3.22.0.css`
- `assets/ggfc-v3.23.0.css`
- `assets/ggfc-v3.23.1.css`
- `assets/ggfc-v3.23.2.css`
- `assets/ggfc-v3.24.0.css`
- `assets/ggfc-v3.24.1.css`
- `assets/ggfc-v3.24.2.css`
- `assets/ggfc-v3.25.1.css`
- `assets/ggfc-v3.25.2.css`
- `assets/ggfc-v3.25.3.css`
- `assets/ggfc.css`
- `docs/GGFC_DUO_TYPE_20종_설계.md`
- `docs/frame-preview/GOLD.png`
- `docs/frame-preview/LEGEND.png`
- `docs/frame-preview/NORMAL.png`
- `docs/frame-preview/SILVER.png`
- `docs/프레임_디자인_미리보기.html`
- `검토결과.md`
- `업데이트_V3.18.13.md`
- `업데이트_V3.19.0.md`
- `업데이트_V3.19.1.md`
- `업데이트_V3.19.2.md`
- `업데이트_V3.20.0.md`
- `업데이트_V3.21.0.md`
- `업데이트_V3.21.1.md`
- `업데이트_V3.21.10.md`
- `업데이트_V3.21.11.md`
- `업데이트_V3.21.12.md`
- `업데이트_V3.21.2.md`
- `업데이트_V3.21.3.md`
- `업데이트_V3.21.4.md`
- `업데이트_V3.21.5.md`
- `업데이트_V3.21.6.md`
- `업데이트_V3.21.7.md`
- `업데이트_V3.21.8.md`
- `업데이트_V3.21.9.md`
- `업데이트_V3.22.0.md`
- `업데이트_V3.23.0.md`
- `업데이트_V3.23.1.md`
- `업데이트_V3.23.2.md`
- `업데이트_V3.24.0.md`
- `업데이트_V3.24.2.md`
- `업데이트_V3.24.3.md`
- `업데이트_V3.24.4.md`
- `업데이트_V3.25.0.md`
- `업데이트_V3.25.1.md`
- `업데이트_V3.25.2.md`
- `업데이트_V3.25.3.md`
- `업데이트_V3.25.4.md`
- `점검보고서_V3.24.1.md`
