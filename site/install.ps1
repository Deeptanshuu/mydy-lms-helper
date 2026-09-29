# Installs the MyDy terminal app on Windows into %LOCALAPPDATA%\Programs\mydy and puts it on your PATH:
#
#   irm https://deeptanshuu.github.io/mydy-lms-helper/install.ps1 | iex
#
# Works in Windows PowerShell 5.1 and PowerShell 7. Options, as environment variables:
#   $env:MYDY_VERSION = "v6.0.0"       install that release instead of the latest
#   $env:MYDY_INSTALL_DIR = "C:\path"  install somewhere other than %LOCALAPPDATA%\Programs\mydy
$ErrorActionPreference = "Stop"
# The progress bar makes Invoke-WebRequest crawl in Windows PowerShell 5.1.
$ProgressPreference = "SilentlyContinue"
# Older Windows PowerShell setups default to TLS versions GitHub no longer accepts.
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

$repo = "Deeptanshuu/mydy-lms-helper"
$version = if ($env:MYDY_VERSION) { $env:MYDY_VERSION } else { "latest" }
$dir = if ($env:MYDY_INSTALL_DIR) { $env:MYDY_INSTALL_DIR } else { Join-Path $env:LOCALAPPDATA "Programs\mydy" }
$base = if ($version -eq "latest") { "https://github.com/$repo/releases/latest/download" } else { "https://github.com/$repo/releases/download/$version" }
$asset = "mydy-windows-x64.exe"

if (-not [Environment]::Is64BitOperatingSystem) { throw "mydy needs 64-bit Windows." }

$tmp = Join-Path ([IO.Path]::GetTempPath()) ("mydy-" + [IO.Path]::GetRandomFileName())
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
try {
  Write-Host "Downloading $asset ($version)..."
  $exe = Join-Path $tmp $asset
  Invoke-WebRequest -Uri "$base/$asset" -OutFile $exe -UseBasicParsing

  # Check the download against the release's SHA256SUMS (releases before it have none).
  $sums = Join-Path $tmp "SHA256SUMS"
  $haveSums = $true
  try { Invoke-WebRequest -Uri "$base/SHA256SUMS" -OutFile $sums -UseBasicParsing } catch { $haveSums = $false }
  if ($haveSums) {
    $line = Get-Content $sums | Where-Object { $_ -match ("\s" + [regex]::Escape($asset) + "$") } | Select-Object -First 1
    $expected = if ($line) { ($line -split "\s+")[0].ToLower() } else { "" }
    $actual = (Get-FileHash -Algorithm SHA256 -Path $exe).Hash.ToLower()
    if (-not $expected -or $expected -ne $actual) { throw "The download doesn't match the release's checksum; try again." }
  }

  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  $target = Join-Path $dir "mydy.exe"
  Move-Item -Force -Path $exe -Destination $target
  # Nothing marks a script download as "from the internet", but clear the mark in case something did.
  try { Unblock-File -Path $target } catch { }
  $installed = & $target --version
  Write-Host "Installed mydy $installed to $target"
} finally {
  Remove-Item -Recurse -Force -Path $tmp -ErrorAction SilentlyContinue
}

$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
$entries = if ($userPath) { $userPath -split ";" } else { @() }
if ($entries -notcontains $dir) {
  $newPath = if ($userPath) { "$userPath;$dir" } else { $dir }
  [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
  $env:Path = "$env:Path;$dir"
  Write-Host "Added $dir to your PATH. Open a new terminal, then run: mydy"
} else {
  Write-Host "Run it with: mydy"
}
