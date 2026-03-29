# Chrome Web Store API 자동화

이 프로젝트에는 Chrome Web Store API V2를 사용하는 PowerShell 배포 스크립트가 포함되어 있습니다.

## 준비

1. Chrome Web Store 개발자 계정에 2단계 인증을 켭니다.
2. 확장 프로그램의 `publisherId`를 Chrome Web Store Developer Dashboard에서 확인합니다.
3. 확장 프로그램 ID는 `nomodebfjalibapnnkfmbmempgkgjhpo` 입니다.

## 파일

- `scripts/cws-release.ps1`: 패키징, 업로드, 배포, 상태 확인
- `.env.cws.example`: 로컬 환경 변수 예시
- `.env.cws`: 실제 비밀값 저장 파일, Git 추적 제외

## 로컬 설정

`.env.cws.example`를 참고해 루트에 `.env.cws` 파일을 만듭니다.

### 인증 방식 1: Refresh Token

다음 값을 `.env.cws`에 넣습니다.

```env
CWS_PUBLISHER_ID=your_publisher_id
CWS_EXTENSION_ID=nomodebfjalibapnnkfmbmempgkgjhpo
CWS_CLIENT_ID=your_oauth_client_id
CWS_CLIENT_SECRET=your_oauth_client_secret
CWS_REFRESH_TOKEN=your_refresh_token
```

### 인증 방식 2: Service Account + gcloud

서비스 계정을 Chrome Web Store Publisher에 추가한 뒤 사용합니다. 로컬에서는 사용자 계정으로 `gcloud` 로그인 후, 스크립트가 `gcloud auth print-access-token --impersonate-service-account=...` 방식으로 짧은 토큰을 받아옵니다.

```env
CWS_PUBLISHER_ID=your_publisher_id
CWS_EXTENSION_ID=nomodebfjalibapnnkfmbmempgkgjhpo
CWS_SERVICE_ACCOUNT_EMAIL=chrome-web-store-publisher@your-project.iam.gserviceaccount.com
CWS_GCP_PROJECT_ID=your-gcp-project-id
```

사전 1회:

```powershell
gcloud auth login
```

## 명령어

패키지만 생성:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\cws-release.ps1 -Action package
```

상태 조회:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\cws-release.ps1 -Action status
```

업로드만 실행:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\cws-release.ps1 -Action upload
```

배포 제출만 실행:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\cws-release.ps1 -Action publish
```

패키징 + 업로드 + 배포 제출:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\cws-release.ps1 -Action release
```

심사 통과 후 즉시 공개하지 않고 staged publish로 제출:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\cws-release.ps1 -Action publish -PublishType STAGED_PUBLISH
```

리뷰 스킵 가능 변경만 시도:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\cws-release.ps1 -Action publish -SkipReview
```

점진 배포 비율 지정:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\cws-release.ps1 -Action publish -DeployPercentage 10
```

## 동작 방식

`release` 액션은 아래 순서로 실행됩니다.

1. `dist/stream-radio-mode-v<manifest.version>.zip` 생성
2. access token 확보
3. `media.upload` 호출
4. 업로드가 비동기 처리이면 `fetchStatus` 폴링
5. `publish` 호출

## 주의사항

- GitHub에 푸시해도 Chrome Web Store는 자동 갱신되지 않습니다. 이 스크립트를 별도로 실행해야 합니다.
- Dashboard에서 공개 범위나 배포 설정을 바꾼 직후에는 API publish가 막힐 수 있습니다. 이 경우 Dashboard에서 한 번 수동 배포 후 다시 API를 사용하세요.
- 스크립트는 기본적으로 `node_modules`, `docs`, `scripts`, `README*`, `LICENSE`, `.env*` 등을 제외하고 업로드 ZIP을 만듭니다.
- Service Account 방식을 쓰려면, 현재 로그인한 사용자에게 대상 서비스 계정의 `Service Account Token Creator` 권한이 있어야 합니다.

## 참고 문서

- Chrome Web Store API 사용 가이드: https://developer.chrome.com/docs/webstore/using-api
- 업로드 API: https://developer.chrome.com/docs/webstore/api/reference/rest/v2/media/upload
- 배포 API: https://developer.chrome.com/docs/webstore/api/reference/rest/v2/publishers.items/publish
- 상태 조회 API: https://developer.chrome.com/docs/webstore/api/reference/rest/v2/publishers.items/fetchStatus
- 서비스 계정 impersonation: https://docs.cloud.google.com/docs/authentication/use-service-account-impersonation
- gcloud access token 발급: https://docs.cloud.google.com/sdk/gcloud/reference/auth/print-access-token
