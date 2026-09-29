#!/bin/sh
# Installs the MyDy terminal app for this machine into ~/.local/bin:
#
#   curl -fsSL https://deeptanshuu.github.io/mydy-lms-helper/install.sh | sh
#
# A file fetched with curl isn't quarantined, so macOS runs it without the "damaged" dialog that a
# browser download of the unsigned binary gets. Options, as environment variables:
#   MYDY_VERSION=v6.0.0       install that release instead of the latest
#   MYDY_INSTALL_DIR=/path    install somewhere other than ~/.local/bin
set -eu

REPO="Deeptanshuu/mydy-lms-helper"
VERSION="${MYDY_VERSION:-latest}"
DIR="${MYDY_INSTALL_DIR:-$HOME/.local/bin}"

say() { printf '%s\n' "$*"; }
fail() {
  printf 'mydy install: %s\n' "$*" >&2
  exit 1
}

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

if command -v curl >/dev/null 2>&1; then
  fetch() { curl -fsSL --retry 2 -o "$2" "$1"; }
elif command -v wget >/dev/null 2>&1; then
  fetch() { wget -q -O "$2" "$1"; }
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
trap 'rm -rf "$tmp"' EXIT
trap 'exit 1' INT TERM

say "Downloading $asset ($VERSION)..."
fetch "$base/$asset" "$tmp/$asset" || fail "couldn't download $base/$asset"

# Check the download against the release's SHA256SUMS (releases before it have none).
if fetch "$base/SHA256SUMS" "$tmp/SHA256SUMS" 2>/dev/null; then
  expected="$(grep " $asset\$" "$tmp/SHA256SUMS" | cut -d ' ' -f 1)"
  if command -v sha256sum >/dev/null 2>&1; then
    actual="$(sha256sum "$tmp/$asset" | cut -d ' ' -f 1)"
  elif command -v shasum >/dev/null 2>&1; then
    actual="$(shasum -a 256 "$tmp/$asset" | cut -d ' ' -f 1)"
  else
    actual="$expected"
    say "No sha256sum or shasum here, so the download isn't checked."
  fi
  [ -n "$expected" ] && [ "$expected" = "$actual" ] || fail "the download doesn't match the release's checksum; try again"
fi

mkdir -p "$DIR"
chmod +x "$tmp/$asset"
if [ "$os" = darwin ]; then xattr -d com.apple.quarantine "$tmp/$asset" 2>/dev/null || true; fi
mv -f "$tmp/$asset" "$DIR/mydy"
say "Installed mydy $("$DIR/mydy" --version 2>/dev/null || echo "") to $DIR/mydy"

case ":$PATH:" in
  *":$DIR:"*) say "Run it with: mydy" ;;
  *)
    case "$(basename "${SHELL:-sh}")" in
      zsh) rc="$HOME/.zshrc" ;;
      bash) if [ "$os" = darwin ]; then rc="$HOME/.bash_profile"; else rc="$HOME/.bashrc"; fi ;;
      fish) rc="" ;;
      *) rc="$HOME/.profile" ;;
    esac
    say ""
    say "$DIR isn't on your PATH yet. Add it, then open a new terminal and run mydy:"
    if [ -n "$rc" ]; then
      say "  echo 'export PATH=\"$DIR:\$PATH\"' >> $rc"
    else
      say "  fish_add_path $DIR"
    fi
    ;;
esac
