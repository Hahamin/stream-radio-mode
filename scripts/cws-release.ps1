param(
    [ValidateSet("package", "status", "upload", "publish", "release")]
    [string]$Action = "release",

    [string]$PublisherId = $env:CWS_PUBLISHER_ID,
    [string]$ExtensionId = $env:CWS_EXTENSION_ID,
    [string]$PackagePath,

    [ValidateSet("DEFAULT_PUBLISH", "STAGED_PUBLISH")]
    [string]$PublishType = "DEFAULT_PUBLISH",

    [switch]$SkipReview,
    [int]$DeployPercentage = -1,
    [int]$UploadPollSeconds = 5,
    [int]$UploadPollAttempts = 24
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$DistDir = Join-Path $RepoRoot "dist"
$LocalEnvPath = Join-Path $RepoRoot ".env.cws"
$ChromeWebStoreScope = "https://www.googleapis.com/auth/chromewebstore"

function Write-Info {
    param([string]$Message)
    Write-Host "[CWS] $Message"
}

function Assert-Command {
    param([string]$CommandName, [string]$InstallHint)

    if (-not (Get-Command $CommandName -ErrorAction SilentlyContinue)) {
        throw "$CommandName 명령을 찾을 수 없습니다. $InstallHint"
    }
}

function Import-LocalEnvFile {
    if (-not (Test-Path $LocalEnvPath)) {
        return
    }

    foreach ($rawLine in Get-Content $LocalEnvPath) {
        $line = $rawLine.Trim()
        if (-not $line) {
            continue
        }
        if ($line.StartsWith("#")) {
            continue
        }

        $parts = $line -split "=", 2
        if ($parts.Count -ne 2) {
            continue
        }

        $name = $parts[0].Trim()
        $value = $parts[1].Trim()

        if ($value.StartsWith('"') -and $value.EndsWith('"')) {
            $value = $value.Substring(1, $value.Length - 2)
        }

        if (-not (Test-Path "Env:$name")) {
            Set-Item -Path "Env:$name" -Value $value
        }
    }
}

function Get-Manifest {
    $manifestPath = Join-Path $RepoRoot "manifest.json"
    return Get-Content $manifestPath -Raw | ConvertFrom-Json
}

function New-ExtensionPackage {
    $manifest = Get-Manifest
    $version = $manifest.version
    $zipName = "stream-radio-mode-v$version.zip"
    $zipPath = Join-Path $DistDir $zipName
    $stageRoot = Join-Path $env:TEMP ("stream-radio-mode-cws-" + [guid]::NewGuid().ToString("N"))

    $excludedNames = @(
        ".git",
        ".github",
        ".idea",
        ".vscode",
        "dist",
        "docs",
        "node_modules",
        "scripts"
    )

    $excludedFilePatterns = @(
        '^\.env(\..+)?$',
        '^\.gitignore$',
        '^LICENSE$',
        '^README(\..+)?\.md$',
        '^package(-lock)?\.json$',
        '^test-.*\.js$',
        '.*\.(crx|log|pem|zip)$'
    )

    New-Item -ItemType Directory -Path $DistDir -Force | Out-Null
    New-Item -ItemType Directory -Path $stageRoot -Force | Out-Null

    try {
        foreach ($item in Get-ChildItem -LiteralPath $RepoRoot -Force) {
            $name = $item.Name

            if ($excludedNames -contains $name) {
                continue
            }

            $skipItem = $false
            foreach ($pattern in $excludedFilePatterns) {
                if ($name -match $pattern) {
                    $skipItem = $true
                    break
                }
            }

            if ($skipItem) {
                continue
            }

            Copy-Item -LiteralPath $item.FullName -Destination (Join-Path $stageRoot $name) -Recurse -Force
        }

        if (Test-Path $zipPath) {
            Remove-Item -LiteralPath $zipPath -Force
        }

        $archiveItems = Get-ChildItem -LiteralPath $stageRoot -Force | Select-Object -ExpandProperty FullName
        if (-not $archiveItems) {
            throw "패키징할 파일이 없습니다."
        }

        Compress-Archive -Path $archiveItems -DestinationPath $zipPath -CompressionLevel Optimal -Force
        Write-Info "패키지 생성 완료: $zipPath"
        return $zipPath
    }
    finally {
        if (Test-Path $stageRoot) {
            Remove-Item -LiteralPath $stageRoot -Recurse -Force
        }
    }
}

function Get-AccessTokenFromRefreshToken {
    $clientId = $env:CWS_CLIENT_ID
    $clientSecret = $env:CWS_CLIENT_SECRET
    $refreshToken = $env:CWS_REFRESH_TOKEN

    if (-not $clientId -or -not $clientSecret -or -not $refreshToken) {
        return $null
    }

    $body = @{
        client_id = $clientId
        client_secret = $clientSecret
        refresh_token = $refreshToken
        grant_type = "refresh_token"
    }

    $response = Invoke-RestMethod `
        -Method Post `
        -Uri "https://oauth2.googleapis.com/token" `
        -Body $body `
        -ContentType "application/x-www-form-urlencoded"

    return $response.access_token
}

function Get-AccessTokenFromGcloud {
    $serviceAccountEmail = $env:CWS_SERVICE_ACCOUNT_EMAIL
    if (-not $serviceAccountEmail) {
        return $null
    }

    Assert-Command -CommandName "gcloud" -InstallHint "Google Cloud SDK를 설치하고 로그인하세요."

    if ($env:CWS_GCP_PROJECT_ID) {
        $null = & gcloud config set project $env:CWS_GCP_PROJECT_ID 2>$null
    }

    $arguments = @(
        "auth",
        "print-access-token",
        "--impersonate-service-account=$serviceAccountEmail",
        "--scopes=$ChromeWebStoreScope"
    )

    $token = (& gcloud @arguments).Trim()
    if (-not $token) {
        throw "gcloud에서 access token을 가져오지 못했습니다."
    }

    return $token
}

function Get-AccessToken {
    if ($env:CWS_ACCESS_TOKEN) {
        return $env:CWS_ACCESS_TOKEN
    }

    $gcloudToken = Get-AccessTokenFromGcloud
    if ($gcloudToken) {
        return $gcloudToken
    }

    $refreshTokenAccessToken = Get-AccessTokenFromRefreshToken
    if ($refreshTokenAccessToken) {
        return $refreshTokenAccessToken
    }

    throw @"
Chrome Web Store 인증 정보가 없습니다.

다음 중 하나를 준비하세요.
1. CWS_ACCESS_TOKEN
2. CWS_SERVICE_ACCOUNT_EMAIL (+ 선택: CWS_GCP_PROJECT_ID, gcloud 로그인)
3. CWS_CLIENT_ID + CWS_CLIENT_SECRET + CWS_REFRESH_TOKEN
"@
}

function Assert-RequiredIds {
    if (-not $PublisherId) {
        throw "CWS_PUBLISHER_ID가 필요합니다."
    }

    if (-not $ExtensionId) {
        throw "CWS_EXTENSION_ID가 필요합니다."
    }
}

function Get-ItemName {
    Assert-RequiredIds
    return "publishers/$PublisherId/items/$ExtensionId"
}

function Invoke-CwsJson {
    param(
        [Parameter(Mandatory = $true)]
        [ValidateSet("GET", "POST")]
        [string]$Method,

        [Parameter(Mandatory = $true)]
        [string]$Uri,

        [Parameter(Mandatory = $true)]
        [string]$AccessToken,

        [object]$Body
    )

    $headers = @{
        Authorization = "Bearer $AccessToken"
    }

    if ($null -ne $Body) {
        $json = $Body | ConvertTo-Json -Depth 8
        return Invoke-RestMethod -Method $Method -Uri $Uri -Headers $headers -ContentType "application/json" -Body $json
    }

    return Invoke-RestMethod -Method $Method -Uri $Uri -Headers $headers
}

function Invoke-CwsUpload {
    param(
        [Parameter(Mandatory = $true)]
        [string]$AccessToken,

        [Parameter(Mandatory = $true)]
        [string]$ZipPath
    )

    $itemName = Get-ItemName
    $uri = "https://chromewebstore.googleapis.com/upload/v2/$itemName`:upload"
    $headers = @{
        Authorization = "Bearer $AccessToken"
    }

    Write-Info "업로드 시작: $ZipPath"
    return Invoke-RestMethod `
        -Method Post `
        -Uri $uri `
        -Headers $headers `
        -InFile $ZipPath `
        -ContentType "application/zip"
}

function Get-CwsStatus {
    param([Parameter(Mandatory = $true)][string]$AccessToken)

    $itemName = Get-ItemName
    $uri = "https://chromewebstore.googleapis.com/v2/$itemName`:fetchStatus"
    return Invoke-CwsJson -Method GET -Uri $uri -AccessToken $AccessToken
}

function Wait-ForUploadCompletion {
    param([Parameter(Mandatory = $true)][string]$AccessToken)

    for ($attempt = 1; $attempt -le $UploadPollAttempts; $attempt++) {
        Start-Sleep -Seconds $UploadPollSeconds
        $status = Get-CwsStatus -AccessToken $AccessToken
        $uploadState = $status.lastAsyncUploadState
        Write-Info "업로드 상태 확인 ($attempt/$UploadPollAttempts): $uploadState"

        if ($uploadState -ne "IN_PROGRESS") {
            return $status
        }
    }

    throw "업로드 상태가 너무 오래 IN_PROGRESS 상태입니다."
}

function Publish-CwsItem {
    param([Parameter(Mandatory = $true)][string]$AccessToken)

    $itemName = Get-ItemName
    $uri = "https://chromewebstore.googleapis.com/v2/$itemName`:publish"
    $body = @{}

    if ($PublishType -ne "DEFAULT_PUBLISH") {
        $body.publishType = $PublishType
    }

    if ($SkipReview.IsPresent) {
        $body.skipReview = $true
    }

    if ($DeployPercentage -ge 0) {
        if ($DeployPercentage -gt 100) {
            throw "DeployPercentage는 0~100 사이여야 합니다."
        }

        $body.deployInfos = @(
            @{
                deployPercentage = $DeployPercentage
            }
        )
    }

    Write-Info "배포 제출 시작"
    return Invoke-CwsJson -Method POST -Uri $uri -AccessToken $AccessToken -Body $body
}

function Show-Json {
    param([Parameter(Mandatory = $true)]$Value)
    $Value | ConvertTo-Json -Depth 10
}

Import-LocalEnvFile

if (-not $PublisherId -and $env:CWS_PUBLISHER_ID) {
    $PublisherId = $env:CWS_PUBLISHER_ID
}

if (-not $ExtensionId -and $env:CWS_EXTENSION_ID) {
    $ExtensionId = $env:CWS_EXTENSION_ID
}

if (-not $PackagePath -and ($Action -eq "package" -or $Action -eq "upload" -or $Action -eq "release")) {
    $PackagePath = New-ExtensionPackage
}

switch ($Action) {
    "package" {
        if (-not $PackagePath) {
            throw "패키지를 만들지 못했습니다."
        }

        Write-Output $PackagePath
        break
    }

    "status" {
        $token = Get-AccessToken
        $status = Get-CwsStatus -AccessToken $token
        Show-Json $status
        break
    }

    "upload" {
        $token = Get-AccessToken
        $uploadResponse = Invoke-CwsUpload -AccessToken $token -ZipPath $PackagePath
        Show-Json $uploadResponse

        if ($uploadResponse.uploadState -eq "IN_PROGRESS") {
            $status = Wait-ForUploadCompletion -AccessToken $token
            Show-Json $status
        }
        break
    }

    "publish" {
        $token = Get-AccessToken
        $publishResponse = Publish-CwsItem -AccessToken $token
        Show-Json $publishResponse
        break
    }

    "release" {
        $token = Get-AccessToken
        $uploadResponse = Invoke-CwsUpload -AccessToken $token -ZipPath $PackagePath
        Show-Json $uploadResponse

        if ($uploadResponse.uploadState -eq "IN_PROGRESS") {
            $status = Wait-ForUploadCompletion -AccessToken $token
            Show-Json $status

            if ($status.lastAsyncUploadState -ne "SUCCEEDED") {
                throw "업로드가 성공 상태로 끝나지 않았습니다: $($status.lastAsyncUploadState)"
            }
        }
        elseif ($uploadResponse.uploadState -ne "SUCCEEDED") {
            throw "업로드가 성공하지 않았습니다: $($uploadResponse.uploadState)"
        }

        $publishResponse = Publish-CwsItem -AccessToken $token
        Show-Json $publishResponse

        # GitHub 릴리즈 생성 + ZIP 에셋 첨부
        $manifest = Get-Manifest
        $version = $manifest.version
        $tagName = "v$version"
        $ghAvailable = Get-Command "gh" -ErrorAction SilentlyContinue

        if ($ghAvailable) {
            Write-Info "GitHub 릴리즈 생성: $tagName"

            # 고정 이름 ZIP 복사 (README 다운로드 링크 호환)
            $fixedZipPath = Join-Path $DistDir "stream-radio-mode.zip"
            Copy-Item -LiteralPath $PackagePath -Destination $fixedZipPath -Force

            $ghArgs = @(
                "release", "create", $tagName,
                $fixedZipPath, $PackagePath,
                "--repo", "Hahamin/stream-radio-mode",
                "--title", $tagName,
                "--notes", "CWS $tagName 릴리즈",
                "--generate-notes"
            )

            try {
                & gh @ghArgs 2>&1 | ForEach-Object { Write-Info $_ }
            }
            catch {
                Write-Info "GitHub 릴리즈 생성 실패 (CWS 배포는 완료됨): $_"
            }
        }
        else {
            Write-Info "gh CLI 미설치 — GitHub 릴리즈 생략"
        }

        break
    }
}
