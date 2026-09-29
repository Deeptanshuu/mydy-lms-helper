#!/bin/sh
# Installs the MyDy terminal app for this machine into ~/.local/bin:
#
#   curl -fsSL https://deeptanshuu.github.io/mydy-lms-helper/install.sh | sh
#
# A file fetched with curl isn't quarantined, so macOS runs it without the "damaged" dialog that a
# browser download of the unsigned binary gets. Options, as environment variables:
#   MYDY_VERSION=v6.0.0       install that release instead of the latest
#   MYDY_INSTALL_DIR=/path    install somewhere other than ~/.local/bin
#   NO_COLOR=1                plain output
set -eu

REPO="Deeptanshuu/mydy-lms-helper"
VERSION="${MYDY_VERSION:-latest}"
DIR="${MYDY_INSTALL_DIR:-$HOME/.local/bin}"

# ── Look ──────────────────────────────────────────────────────────────────────────────────────
# The same palette as the app. Colour, the live meter and the wordmark only when writing to a
# terminal; piped into a file or a CI log, it prints plain lines.
ESC="$(printf '\033')"
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ] && [ "${TERM:-dumb}" != dumb ]; then tty=1; else tty=0; fi
case "${LC_ALL:-${LC_CTYPE:-${LANG:-}}}" in
  *[Uu][Tt][Ff]-8* | *[Uu][Tt][Ff]8*) utf=1 ;;
  *) if [ "$(uname -s)" = Darwin ]; then utf=1; else utf=0; fi ;;
esac

if [ "$tty" = 1 ]; then
  case "${COLORTERM:-}" in
    truecolor | 24bit)
      ACC="$ESC[38;2;255;101;0m" OK="$ESC[38;2;111;207;151m" LOW="$ESC[38;2;255;79;154m"
      MUTED="$ESC[38;2;139;146;154m" FAINT="$ESC[38;2;92;99;107m" ;;
    *)
      ACC="$ESC[38;5;202m" OK="$ESC[38;5;78m" LOW="$ESC[38;5;204m" MUTED="$ESC[38;5;246m" FAINT="$ESC[38;5;241m" ;;
  esac
  B="$ESC[1m" R="$ESC[0m" CLR="$(printf '\r')$ESC[2K"
  cols="$(tput cols 2>/dev/null || echo 80)"
else
  ACC="" OK="" LOW="" MUTED="" FAINT="" B="" R="" CLR="" cols=80
fi
if [ "$utf" = 1 ]; then
  TICK="✓" CROSS="✗" SKIP="·" FULL="━" HALF="╸" TRACK="━"
else
  TICK="+" CROSS="x" SKIP="-" FULL="=" HALF="-" TRACK="-"
fi

# The spinner frame for tick $1.
spin() {
  if [ "$utf" = 0 ]; then
    case $(($1 % 4)) in 0) printf '|' ;; 1) printf '/' ;; 2) printf '-' ;; *) printf '\\' ;; esac
    return
  fi
  case $(($1 % 10)) in
    0) printf '⠋' ;; 1) printf '⠙' ;; 2) printf '⠹' ;; 3) printf '⠸' ;; 4) printf '⠼' ;;
    5) printf '⠴' ;; 6) printf '⠦' ;; 7) printf '⠧' ;; 8) printf '⠇' ;; *) printf '⠏' ;;
  esac
}
# $1 repeated $2 times.
rep() {
  out="" n="$2"
  while [ "$n" -gt 0 ]; do out="$out$1" n=$((n - 1)); done
  printf '%s' "$out"
}
# A byte count as megabytes with one decimal.
mb() { printf '%d.%d MB' $(($1 / 1048576)) $(($1 * 10 / 1048576 % 10)); }
# A path with the home folder shortened to ~.
tilde() { case "$1" in "$HOME"/*) printf '~/%s' "${1#"$HOME"/}" ;; *) printf '%s' "$1" ;; esac; }

# One step of the checklist: a mark, a label and a value. On a terminal it replaces the line the
# live step drew.
step() { printf '%s  %s %s%-9s%s %s\n' "$CLR" "$1" "$MUTED" "$2" "$R" "$3"; }
done_() { step "$OK$TICK$R" "$1" "$2"; }
skip() { step "$FAINT$SKIP$R" "$1" "$MUTED$2$R"; }
# The live line of a step in progress, redrawn in place (terminals only).
live() {
  [ "$tty" = 1 ] || return 0
  printf '%s  %s%s%s %s%-9s%s %s' "$CLR" "$ACC" "$(spin "$1")" "$R" "$MUTED" "$2" "$R" "$3"
}

# A download meter, like the app's: $1 of $2 bytes over $3 cells.
meter() {
  halves=$(($1 * $3 * 2 / $2))
  [ "$halves" -le $(($3 * 2)) ] || halves=$(($3 * 2))
  full=$((halves / 2)) half=$((halves % 2))
  printf '%s%s' "$ACC" "$(rep "$FULL" "$full")"
  [ "$half" = 0 ] || printf '%s' "$HALF"
  printf '%s%s%s' "$FAINT" "$(rep "$TRACK" $(($3 - full - half)))" "$R"
}
# Fits the meter to the terminal: the rest of the line takes about 40 columns.
width=$((cols - 44))
[ "$width" -le 28 ] || width=28
[ "$width" -ge 8 ] || width=8

pid=""
cleanup() {
  [ -z "$pid" ] || kill "$pid" 2>/dev/null || true
  [ "$tty" = 0 ] || printf '%s[?25h' "$ESC"
  rm -rf "$tmp"
}
fail() {
  printf '%s  %s%s %s%s\n' "$CLR" "$LOW" "$CROSS" "$*" "$R" >&2
  exit 1
}

# ── Header ────────────────────────────────────────────────────────────────────────────────────
if [ "$tty" = 1 ]; then
  printf '\n'
  if [ "$utf" = 1 ]; then
    # The app's wordmark, drawn in half blocks: an orange chevron, MYDY and the cursor.
    printf '  %s▀▄ %s  %s█▄ ▄█ ▀▄ ▄▀ █▀▀▄ ▀▄ ▄▀%s\n' "$ACC" "$R" "$B" "$R"
    printf '  %s ▄▀%s  %s█ ▀ █   █   █  █   █  %s\n' "$ACC" "$R" "$B" "$R"
    printf '  %s▀  %s  %s▀   ▀   ▀   ▀▀▀    ▀  %s %s▀▀▀%s\n' "$ACC" "$R" "$B" "$R" "$ACC" "$R"
  else
    printf '  %s>%s %sMYDY%s%s_%s\n' "$ACC" "$R" "$B" "$R" "$ACC" "$R"
  fi
  printf '\n  %sAttendance, deadlines and files, in one place%s\n\n' "$FAINT" "$R"
else
  printf 'Installing the MyDy terminal app\n'
fi

# ── Platform ──────────────────────────────────────────────────────────────────────────────────
case "$(uname -s)" in
  Darwin) os=darwin ;;
  Linux) os=linux ;;
  *) fail "no build for $(uname -s). On Windows, run this in PowerShell: irm https://deeptanshuu.github.io/mydy-lms-helper/install.ps1 | iex" ;;
esac
case "$(uname -m)" in
  arm64 | aarch64) arch=arm64 ;;
  x86_64 | amd64) arch=x64 ;;
  *) fail "no build for a $(uname -m) processor" ;;
esac
# A shell running under Rosetta on Apple Silicon reports x86_64: install the native build anyway.
if [ "$os" = darwin ] && [ "$arch" = x64 ] && [ "$(sysctl -n sysctl.proc_translated 2>/dev/null || echo 0)" = 1 ]; then
  arch=arm64
fi
if [ "$os" = linux ] && { [ -f /etc/alpine-release ] || ldd --version 2>&1 | grep -qi musl; }; then
  fail "the Linux builds need glibc; musl systems such as Alpine aren't supported"
fi
case "$os-$arch" in
  darwin-arm64) platform="macOS, Apple Silicon" ;;
  darwin-x64) platform="macOS, Intel" ;;
  *) platform="Linux, $arch" ;;
esac
done_ Platform "$platform"

if command -v curl >/dev/null 2>&1; then
  fetch() { curl -fsSL --retry 2 -o "$2" "$1"; }
  # The response headers of a one-byte request: they name the release and the full size.
  probe() { curl -fsSL -r 0-0 -D - -o /dev/null "$1" 2>/dev/null; }
elif command -v wget >/dev/null 2>&1; then
  fetch() { wget -q -O "$2" "$1"; }
  probe() { wget -S --header='Range: bytes=0-0' -O /dev/null "$1" 2>&1; }
else
  fail "needs curl or wget"
fi

asset="mydy-$os-$arch"
if [ "$VERSION" = latest ]; then
  base="https://github.com/$REPO/releases/latest/download"
else
  base="https://github.com/$REPO/releases/download/$VERSION"
fi

tmp="$(mktemp -d)"
trap cleanup EXIT
trap 'fail cancelled' INT TERM
[ "$tty" = 0 ] || printf '%s[?25l' "$ESC"

# ── Release ───────────────────────────────────────────────────────────────────────────────────
if [ "$VERSION" = latest ]; then which="the latest release"; else which="release $VERSION"; fi
live 0 Release "finding $which"
headers="$(probe "$base/$asset")" || fail "couldn't reach $which on GitHub; check the version and your connection"
headers="$(printf '%s\n' "$headers" | tr -d '\r')"
tag="$(printf '%s\n' "$headers" | sed -n 's#^ *[Ll]ocation: .*/releases/download/\([^/]*\)/.*#\1#p' | head -n 1)"
[ -n "$tag" ] || tag="$VERSION"
size="$(printf '%s\n' "$headers" | sed -n 's#^ *[Cc]ontent-[Rr]ange: bytes [0-9]*-[0-9]*/\([0-9][0-9]*\).*#\1#p' | tail -n 1)"
size="${size:-0}"
# Pin the rest of the install to that release, so a new one can't land halfway through.
case "$tag" in v*) base="https://github.com/$REPO/releases/download/$tag" ;; esac
done_ Release "$tag"

# ── Download ──────────────────────────────────────────────────────────────────────────────────
file="$tmp/$asset"
if [ "$tty" = 1 ]; then
  fetch "$base/$asset" "$file" 2>/dev/null &
  pid=$!
  tick=0
  while kill -0 "$pid" 2>/dev/null; do
    got=0
    [ ! -f "$file" ] || got="$(wc -c <"$file" | tr -d ' ')"
    if [ "$size" -gt 0 ]; then
      live "$tick" Download "$(meter "$got" "$size" "$width")  $(printf '%3d%%' $((got * 100 / size)))  $MUTED$(mb "$got") / $(mb "$size")$R"
    else
      live "$tick" Download "$MUTED$(mb "$got")$R"
    fi
    tick=$((tick + 1))
    sleep 0.1 2>/dev/null || sleep 1
  done
  ok=0
  wait "$pid" || ok=$?
  pid=""
  [ "$ok" = 0 ] || fail "couldn't download $base/$asset"
else
  fetch "$base/$asset" "$file" || fail "couldn't download $base/$asset"
fi
got="$(wc -c <"$file" | tr -d ' ')"
if [ "$tty" = 1 ]; then
  done_ Download "$(meter 1 1 "$width")  $MUTED$(mb "$got")$R"
else
  done_ Download "$asset, $(mb "$got")"
fi

# ── Checksum ──────────────────────────────────────────────────────────────────────────────────
# Check the download against the release's SHA256SUMS (releases before it have none).
if fetch "$base/SHA256SUMS" "$tmp/SHA256SUMS" 2>/dev/null; then
  expected="$(grep " $asset\$" "$tmp/SHA256SUMS" | cut -d ' ' -f 1)"
  if command -v sha256sum >/dev/null 2>&1; then
    actual="$(sha256sum "$file" | cut -d ' ' -f 1)"
  elif command -v shasum >/dev/null 2>&1; then
    actual="$(shasum -a 256 "$file" | cut -d ' ' -f 1)"
  else
    actual=""
  fi
  if [ -z "$actual" ]; then
    skip Checksum "not checked: no sha256sum or shasum here"
  elif [ -n "$expected" ] && [ "$expected" = "$actual" ]; then
    done_ Checksum "SHA-256 matches the release"
  else
    fail "the download doesn't match the release's checksum; try again"
  fi
else
  skip Checksum "this release publishes none"
fi

# ── Install ───────────────────────────────────────────────────────────────────────────────────
before=""
[ ! -x "$DIR/mydy" ] || before="$("$DIR/mydy" --version 2>/dev/null || true)"
mkdir -p "$DIR"
chmod +x "$file"
if [ "$os" = darwin ]; then xattr -d com.apple.quarantine "$file" 2>/dev/null || true; fi
mv -f "$file" "$DIR/mydy"
now="$("$DIR/mydy" --version 2>/dev/null || true)"
done_ Install "$(tilde "$DIR/mydy")"
[ "$tty" = 0 ] || printf '%s[?25h' "$ESC"

# ── Done ──────────────────────────────────────────────────────────────────────────────────────
if [ -z "$before" ]; then
  what="mydy ${now:-${tag#v}} is installed."
elif [ "$before" = "$now" ]; then
  what="mydy $now is already up to date."
else
  what="Updated mydy from $before to ${now:-${tag#v}}."
fi
run="$ACC${B}mydy$R"
printf '\n'
case ":$PATH:" in
  *":$DIR:"*)
    printf '  %s Run %s to get started.\n\n' "$what" "$run"
    ;;
  *)
    case "$(basename "${SHELL:-sh}")" in
      zsh) rc="$HOME/.zshrc" ;;
      bash) if [ "$os" = darwin ]; then rc="$HOME/.bash_profile"; else rc="$HOME/.bashrc"; fi ;;
      fish) rc="" ;;
      *) rc="$HOME/.profile" ;;
    esac
    printf '  %s\n\n' "$what"
    printf '  One more step: %s isn'"'"'t on your PATH yet. Add it, then open a new\n' "$(tilde "$DIR")"
    printf '  terminal and run %s:\n\n' "$run"
    if [ -n "$rc" ]; then
      printf '    %secho '"'"'export PATH="%s:$PATH"'"'"' >> %s%s\n\n' "$B" "$DIR" "$(tilde "$rc")" "$R"
    else
      printf '    %sfish_add_path %s%s\n\n' "$B" "$DIR" "$R"
    fi
    ;;
esac
