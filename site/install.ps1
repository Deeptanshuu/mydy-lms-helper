# Installs the MyDy terminal app on Windows into %LOCALAPPDATA%\Programs\mydy and puts it on your PATH:
#
#   irm https://deeptanshuu.github.io/mydy-lms-helper/install.ps1 | iex
#
# Works in Windows PowerShell 5.1 and PowerShell 7. Options, as environment variables:
#   $env:MYDY_VERSION = "v6.0.0"       install that release instead of the latest
#   $env:MYDY_INSTALL_DIR = "C:\path"  install somewhere other than %LOCALAPPDATA%\Programs\mydy
#   $env:NO_COLOR = "1"                plain output
#
# Everything runs in its own scope, so nothing it sets is left behind in your session. The file is
# plain ASCII: Windows PowerShell can misread other characters in a script piped into iex, so the
# ones drawn on screen are built from their code points.
& {
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

# -- Look ----------------------------------------------------------------------------------------
# The same palette as the app. Colour and the live meter only in a console; redirected, it prints
# plain lines.
$esc = [char]27
$tty = -not [Console]::IsOutputRedirected
$vt = $tty -and -not $env:NO_COLOR -and [bool]$Host.UI.SupportsVirtualTerminal
$ansi = @{ acc = "38;2;255;101;0"; ok = "38;2;111;207;151"; low = "38;2;255;79;154"; muted = "38;2;139;146;154"; faint = "38;2;92;99;107"; bold = "1" }
$plain = @{ acc = "DarkYellow"; ok = "Green"; low = "Magenta"; muted = "Gray"; faint = "DarkGray" }
function U([int[]]$codes) { -join ($codes | ForEach-Object { [char]$_ }) }
# Windows Terminal, VS Code and terminals outside Windows fall back on other fonts for any
# character; the classic console draws only what its font has, so it gets the code page 437 set.
$fancy = $env:WT_SESSION -or $env:TERM_PROGRAM -or ($PSVersionTable.PSVersion.Major -ge 6 -and -not $IsWindows)
if ($fancy) {
  $tick = U 0x2713; $cross = U 0x2717; $skip = U 0x00B7; $full = U 0x2501; $half = U 0x2578; $track = U 0x2501
  $frames = @(0x280B, 0x2819, 0x2839, 0x2838, 0x283C, 0x2834, 0x2826, 0x2827, 0x2807, 0x280F) | ForEach-Object { U $_ }
} else {
  $tick = U 0x221A; $cross = "x"; $skip = "-"; $full = U 0x2588; $half = U 0x258C; $track = U 0x2591
  $frames = @("|", "/", "-", "\")
}
# The width of the line being redrawn, so a shorter redraw can blank the rest.
$state = @{ width = 0 }

# Draws one line from segments, each @(text, tone). -Live leaves the cursor on it so the next call
# redraws it in place; without it the line is final.
function Show-Line([object[]]$segs, [switch]$Live) {
  if ($Live -and -not $tty) { return }
  $width = 0
  foreach ($s in $segs) { $width += $s[0].Length }
  if ($tty) { Write-Host ($(if ($vt) { "`r$esc[2K" } else { "`r" })) -NoNewline }
  foreach ($s in $segs) {
    $text, $tone = $s
    if (-not $tone -or -not $tty -or $env:NO_COLOR) { Write-Host $text -NoNewline }
    elseif ($vt) { Write-Host "$esc[$($ansi[$tone])m$text$esc[0m" -NoNewline }
    elseif ($plain[$tone]) { Write-Host $text -NoNewline -ForegroundColor $plain[$tone] }
    else { Write-Host $text -NoNewline }
  }
  # Without escape codes the old line is cleared by writing over it.
  if ($tty -and -not $vt -and $state.width -gt $width) { Write-Host (" " * ($state.width - $width)) -NoNewline }
  $state.width = if ($Live) { $width } else { 0 }
  if (-not $Live) { Write-Host "" }
}
function Step([string]$mark, [string]$tone, [string]$label, [object[]]$value) {
  Show-Line (@(, @("  ", $null)) + @(, @($mark, $tone)) + @(, @((" " + $label.PadRight(10)), "muted")) + $value)
}
function Done([string]$label, [object[]]$value) { Step $tick "ok" $label $value }
function Live([int]$n, [string]$label, [object[]]$value) {
  Show-Line (@(, @("  ", $null)) + @(, @($frames[$n % $frames.Count], "acc")) + @(, @((" " + $label.PadRight(10)), "muted")) + $value) -Live
}
function MB([long]$bytes) { "{0:0.0} MB" -f ($bytes / 1MB) }
# A download meter, like the app's: $got of $total bytes over $cells cells.
function Meter([long]$got, [long]$total, [int]$cells) {
  $halves = [Math]::Min($cells * 2, [int][Math]::Floor($got * $cells * 2 / [Math]::Max(1, $total)))
  $n = [int][Math]::Floor($halves / 2); $h = $halves % 2
  @(@((($full * $n) + ($half * $h)), "acc"), @(($track * ($cells - $n - $h)), "faint"))
}
function Tilde([string]$path) { if ($path.StartsWith($HOME)) { "~" + $path.Substring($HOME.Length) } else { $path } }

$cells = 28
try { $cells = [Math]::Max(8, [Math]::Min(28, [Console]::WindowWidth - 44)) } catch { }

# -- Header --------------------------------------------------------------------------------------
if ($tty) {
  # The app's wordmark in half blocks (T, B and F stand for the upper half, lower half and full block).
  function Glyphs([string]$s) { $s.Replace("T", (U 0x2580)).Replace("B", (U 0x2584)).Replace("F", (U 0x2588)) }
  Write-Host ""
  Show-Line @(@("  ", $null), @((Glyphs "TB "), "acc"), @("  ", $null), @((Glyphs "FB BF TB BT FTTB TB BT"), "bold"))
  Show-Line @(@("  ", $null), @((Glyphs " BT"), "acc"), @("  ", $null), @((Glyphs "F T F   F   F  F   F  "), "bold"))
  Show-Line @(@("  ", $null), @((Glyphs "T  "), "acc"), @("  ", $null), @((Glyphs "T   T   T   TTT    T  "), "bold"), @(" ", $null), @((Glyphs "TTT"), "acc"))
  Write-Host ""
  Show-Line @(, @("  Attendance, deadlines and files, in one place", "faint"))
  Write-Host ""
} else {
  Write-Host "Installing the MyDy terminal app"
}

# Stops the install with a message; the catch at the bottom shows it.
function Fail([string]$message) { throw [InvalidOperationException]::new($message) }

try {

if (-not [Environment]::Is64BitOperatingSystem) { Fail "mydy needs 64-bit Windows." }
Done "Platform" @(, @("Windows, x64", $null))

$tmp = Join-Path ([IO.Path]::GetTempPath()) ("mydy-" + [IO.Path]::GetRandomFileName())
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
try {
  try { if ($tty) { [Console]::CursorVisible = $false } } catch { }

  # -- Release -----------------------------------------------------------------------------------
  # The latest-release link redirects to the release's own, which names its tag. Pin the rest of
  # the install to that release, so a new one can't land halfway through.
  $which = if ($version -eq "latest") { "the latest release" } else { "release $version" }
  Live 0 "Release" @(, @("finding $which", $null))
  $tag = $version
  try {
    $request = [Net.WebRequest]::Create("$base/$asset")
    $request.AllowAutoRedirect = $false
    $response = $request.GetResponse()
    $location = $response.Headers["Location"]
    $response.Close()
    if ($location -match "/releases/download/([^/]+)/") { $tag = $Matches[1] }
  } catch {
    Fail "couldn't reach $which on GitHub; check the version and your connection"
  }
  if ($tag -like "v*") { $base = "https://github.com/$repo/releases/download/$tag" }
  Done "Release" @(, @($tag, $null))

  # -- Download ----------------------------------------------------------------------------------
  $exe = Join-Path $tmp $asset
  $got = 0L
  try {
    $response = [Net.WebRequest]::Create("$base/$asset").GetResponse()
    $total = $response.ContentLength
    $in = $response.GetResponseStream()
    $out = [IO.File]::Create($exe)
    try {
      $buffer = New-Object byte[] 65536
      $clock = [Diagnostics.Stopwatch]::StartNew()
      $tickAt = -1000; $n = 0
      while (($read = $in.Read($buffer, 0, $buffer.Length)) -gt 0) {
        $out.Write($buffer, 0, $read)
        $got += $read
        if ($clock.ElapsedMilliseconds - $tickAt -ge 100) {
          $tickAt = $clock.ElapsedMilliseconds
          if ($total -gt 0) {
            $pct = "{0,5}" -f ("{0}%" -f [Math]::Floor($got * 100 / $total))
            Live $n "Download" ((Meter $got $total $cells) + @(, @("  $pct  ", $null)) + @(, @("$(MB $got) / $(MB $total)", "muted")))
          } else {
            Live $n "Download" @(, @((MB $got), "muted"))
          }
          $n++
        }
      }
    } finally {
      $out.Dispose(); $in.Dispose(); $response.Close()
    }
  } catch {
    $why = if ($_.Exception.InnerException) { $_.Exception.InnerException.Message } else { $_.Exception.Message }
    Fail "couldn't download $base/$asset ($why)"
  }
  if ($tty) { Done "Download" ((Meter 1 1 $cells) + @(, @("  $(MB $got)", "muted"))) }
  else { Done "Download" @(, @("$asset, $(MB $got)", $null)) }

  # -- Checksum ----------------------------------------------------------------------------------
  # Check the download against the release's SHA256SUMS (releases before it have none).
  $sums = Join-Path $tmp "SHA256SUMS"
  $haveSums = $true
  try { Invoke-WebRequest -Uri "$base/SHA256SUMS" -OutFile $sums -UseBasicParsing } catch { $haveSums = $false }
  if ($haveSums) {
    $line = Get-Content $sums | Where-Object { $_ -match ("\s" + [regex]::Escape($asset) + "$") } | Select-Object -First 1
    $expected = if ($line) { ($line -split "\s+")[0].ToLower() } else { "" }
    $actual = (Get-FileHash -Algorithm SHA256 -Path $exe).Hash.ToLower()
    if (-not $expected -or $expected -ne $actual) { Fail "the download doesn't match the release's checksum; try again" }
    Done "Checksum" @(, @("SHA-256 matches the release", $null))
  } else {
    Step $skip "faint" "Checksum" @(, @("this release publishes none", "muted"))
  }

  # -- Install -----------------------------------------------------------------------------------
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  $target = Join-Path $dir "mydy.exe"
  $before = if (Test-Path $target) { try { & $target --version 2>$null } catch { "" } } else { "" }
  Move-Item -Force -Path $exe -Destination $target
  # Nothing marks a script download as "from the internet", but clear the mark in case something did.
  try { Unblock-File -Path $target } catch { }
  $now = try { & $target --version 2>$null } catch { "" }
  Done "Install" @(, @((Tilde $target), $null))
} finally {
  try { if ($tty) { [Console]::CursorVisible = $true } } catch { }
  Remove-Item -Recurse -Force -Path $tmp -ErrorAction SilentlyContinue
}

$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
$entries = if ($userPath) { $userPath -split ";" } else { @() }
if ($entries -notcontains $dir) {
  $newPath = if ($userPath) { "$userPath;$dir" } else { $dir }
  [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
  $env:Path = "$env:Path;$dir"
  Done "PATH" @(, @("added $(Tilde $dir)", $null))
}

# -- Done ----------------------------------------------------------------------------------------
$shown = if ($now) { $now } else { $tag.TrimStart("v") }
$what = if (-not $before) { "mydy $shown is installed." } elseif ($before -eq $now) { "mydy $now is already up to date." } else { "Updated mydy from $before to $shown." }
Write-Host ""
Show-Line @(@("  $what Run ", $null), @("mydy", "acc"), @(" to get started.", $null))
Write-Host ""
} catch {
  # One line for the failure rather than a PowerShell error record; the exit code still says so.
  Step $cross "low" $_.Exception.Message @()
  $global:LASTEXITCODE = 1
}
}
