<#
.SYNOPSIS
    Local build, sign, package, and GitHub Release publish script for WestPlay Domestic Edition.
.DESCRIPTION
    Synchronizes optional version bumps, runs the test suite, builds native resources and the signed
    NSIS installer, generates `latest.json`, `.sha256`, and `domestic-build-manifest.json`, and publishes
    the release to `juner122king/WestPlay` via `gh` CLI (unless `-DryRun` is passed).
#>
[CmdletBinding()]
param(
    [string]$Version,
    [switch]$BumpDomestic,
    [string]$SigningKeyPath = $env:TAURI_SIGNING_PRIVATE_KEY_PATH,
    [string]$LlvmMingw = $env:WESTPLAY_LLVM_MINGW,
    [string]$Repo = 'juner122king/WestPlay',
    [switch]$DryRun,
    [switch]$Deploy,
    [switch]$SkipTests,
    [switch]$Overwrite,
    [switch]$PreRelease,
    [switch]$Draft
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$releaseLib = Join-Path $PSScriptRoot 'release_lib.py'

function Assert-Command([string]$Name) {
    if (!(Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required command '$Name' was not found in PATH."
    }
}

function Invoke-Checked([string]$Label, [scriptblock]$Action) {
    Write-Host "==> $Label" -ForegroundColor Cyan
    & $Action
    if ($LASTEXITCODE -ne 0) {
        throw "$Label failed with exit code $LASTEXITCODE."
    }
}

Push-Location $root
try {
    foreach ($cmd in @('git', 'cargo', 'node', 'npm', 'python')) {
        Assert-Command $cmd
    }
    if (!$DryRun) {
        Assert-Command 'gh'
        Invoke-Checked 'Verify GitHub CLI authentication' { gh auth status }
    }

    if (!$LlvmMingw) {
        $LlvmMingw = Join-Path $root 'target/toolchains/llvm-mingw-20260602-ucrt-x86_64'
    }
    $LlvmMingw = [IO.Path]::GetFullPath($LlvmMingw)
    foreach ($tool in @('clang.exe', 'llvm-ar.exe')) {
        if (!(Test-Path -LiteralPath (Join-Path $LlvmMingw "bin/$tool"))) {
            throw "Missing $tool under $LlvmMingw. Set WESTPLAY_LLVM_MINGW or -LlvmMingw."
        }
    }

    $env:WESTPLAY_LLVM_MINGW = $LlvmMingw
    $env:CC = Join-Path $LlvmMingw 'bin/clang.exe'
    $env:AR = Join-Path $LlvmMingw 'bin/llvm-ar.exe'

    if (!$SigningKeyPath) {
        $SigningKeyPath = Join-Path $env:USERPROFILE '.tauri/westplay-domestic.key'
    }
    if (!$env:TAURI_SIGNING_PRIVATE_KEY) {
        if (!(Test-Path -LiteralPath $SigningKeyPath)) {
            throw "Signing private key not found at '$SigningKeyPath'. Set TAURI_SIGNING_PRIVATE_KEY or pass -SigningKeyPath."
        }
        $env:TAURI_SIGNING_PRIVATE_KEY = (Get-Content -Raw -LiteralPath $SigningKeyPath).Trim()
    }
    $pubKeyFile = "$SigningKeyPath.pub"
    if (Test-Path -LiteralPath $pubKeyFile) {
        $expectedPub = (Get-Content -Raw -LiteralPath $pubKeyFile).Trim()
        $tauriConf = Get-Content -Raw -LiteralPath (Join-Path $root 'app/tauri.conf.json') | ConvertFrom-Json
        $configuredPub = [string]$tauriConf.plugins.updater.pubkey
        if ($configuredPub.Trim() -ne $expectedPub) {
            throw "Public key in app/tauri.conf.json does not match '$pubKeyFile'."
        }
    }

    if ($Version -and $BumpDomestic) {
        throw 'Specify either -Version or -BumpDomestic, not both.'
    }
    if ($BumpDomestic) {
        $Version = (python $releaseLib next-version --repo-root $root).Trim()
        if ($LASTEXITCODE -ne 0) { throw 'Failed to compute next domestic version.' }
    } elseif (!$Version) {
        $Version = (python $releaseLib current-version --repo-root $root).Trim()
        if ($LASTEXITCODE -ne 0) { throw 'Failed to read current workspace version.' }
    } else {
        Invoke-Checked "Sync version to $Version" {
            python $releaseLib sync-version --repo-root $root --version $Version
        }
    }

    if ($BumpDomestic) {
        Invoke-Checked "Sync version to $Version" {
            python $releaseLib sync-version --repo-root $root --version $Version
        }
    }

    if ($Version -and ($BumpDomestic -or $PSBoundParameters.ContainsKey('Version'))) {
        Invoke-Checked 'Update workspace entries in Cargo.lock' {
            cargo update --workspace
        }
    }

    Invoke-Checked "Verify CHANGELOG.md entry for $Version" {
        python $releaseLib extract-notes --repo-root $root --version $Version | Out-Null
    }

    if (!$SkipTests) {
        Invoke-Checked 'Run Rust workspace tests' { cargo test --workspace --locked }
        Invoke-Checked 'Run UI tests' { npm --prefix ui test -- --run }
        Invoke-Checked 'Run UI lint' { npm --prefix ui run lint }
        Invoke-Checked 'Run tools Python tests' { python -m unittest discover -s tools/tests -v }
    }

    Invoke-Checked 'Build native resources, UI, and signed NSIS installer' {
        npm run build:release -- --ci -- --locked
    }

    if ($Deploy) {
        Invoke-Checked 'Deploy westplay.dll and westplay-probe.exe to local games' {
            python tools/build_plugin.py --deploy
        }
    }

    $commit = (git rev-parse HEAD).Trim()
    if ($LASTEXITCODE -ne 0) { throw 'Failed to read git HEAD commit.' }

    $artifactsJson = python $releaseLib generate-artifacts --repo-root $root --version $Version --commit $commit --repo $Repo
    if ($LASTEXITCODE -ne 0) { throw 'Failed to generate updater artifacts and manifest.' }
    $artifacts = $artifactsJson | ConvertFrom-Json

    Write-Host ''
    Write-Host "Release artifacts prepared for v$Version ($commit):" -ForegroundColor Green
    Write-Host "  Installer : $($artifacts.installer)"
    Write-Host "  Signature : $($artifacts.signature)"
    Write-Host "  SHA-256   : $($artifacts.sha256)"
    Write-Host "  latest.json: $($artifacts.latest)"
    Write-Host "  Manifest  : $($artifacts.manifest)"

    if ($DryRun) {
        Write-Host ''
        Write-Host 'DryRun enabled: skipping git tag push and GitHub Release upload.' -ForegroundColor Yellow
        return
    }

    $dirty = git status --porcelain
    if ($dirty) {
        throw "Working tree has uncommitted changes. Commit and push your release changes before publishing (or pass -DryRun)."
    }

    $tag = "v$Version"
    $uploadFiles = @(
        $artifacts.installer,
        $artifacts.signature,
        $artifacts.sha256,
        $artifacts.latest
    )

    $existingTag = git tag -l $tag
    if (!$existingTag) {
        Invoke-Checked "Create git tag $tag" { git tag -a $tag -m "WestPlay $Version" }
    }
    Invoke-Checked "Push git tag $tag to origin" { git push origin $tag }

    $releaseExists = $false
    gh release view $tag --repo $Repo *> $null
    if ($LASTEXITCODE -eq 0) {
        $releaseExists = $true
    }

    if ($releaseExists) {
        if (!$Overwrite) {
            throw "GitHub Release $tag already exists on $Repo. Pass -Overwrite to replace assets."
        }
        Invoke-Checked "Upload and replace assets on existing release $tag" {
            gh release upload $tag @uploadFiles --repo $Repo --clobber
        }
        Invoke-Checked "Update release notes for $tag" {
            gh release edit $tag --repo $Repo --title "WestPlay $Version" --notes-file $artifacts.notes
        }
    } else {
        [string[]]$createArgs = @('release', 'create', $tag) + $uploadFiles + @(
            '--repo', $Repo,
            '--title', "WestPlay $Version",
            '--notes-file', $artifacts.notes
        )
        if ($PreRelease) { $createArgs += '--prerelease' }
        if ($Draft) { $createArgs += '--draft' }
        Invoke-Checked "Create GitHub Release $tag on $Repo" {
            & gh @createArgs
        }
    }

    Write-Host "Published WestPlay $Version to https://github.com/$Repo/releases/tag/$tag" -ForegroundColor Green
} finally {
    Pop-Location
}
