# Terminal UI

Attendance, deadlines, grades, announcements and course files from MyDy on one screen. Part of [MyDy LMS Helper](../README.md).

<img alt="Overview: attendance, due this week and grades, attendance by course, and upcoming deadlines" src="../docs/assets/tui-overview.svg" width="100%">

<img alt="Assignments tab: due soon first, then submitted and graded work" src="../docs/assets/tui-assignments.svg" width="100%">

## Install

Download the binary for your system from [Releases](https://github.com/Deeptanshuu/mydy-lms-helper/releases) and run it:

```sh
chmod +x mydy-darwin-arm64
xattr -d com.apple.quarantine mydy-darwin-arm64   # macOS only: the binary isn't notarized
./mydy-darwin-arm64
```

Or from source, with [Bun](https://bun.com) 1.3+:

```sh
git clone https://github.com/Deeptanshuu/mydy-lms-helper.git
cd mydy-lms-helper && bun install && bun run tui
```

## Signing in

The first of these wins:

1. `MYDY_USERNAME` and `MYDY_PASSWORD` from the environment or a `.env` file
2. A login saved with **Remember me** (in the system keychain)
3. The sign-in screen

## Keys

| Key | Does |
|---|---|
| `↑` `↓` / `j` `k` | Move (the first row is the Overview dashboard) |
| `enter` | Open the course or the Overview, read an announcement; on an Overview deadline, jump to its course |
| `tab` / `shift+tab` | Next / previous course tab |
| `space` | Mark the course for download |
| `d` | Download the marked courses (or the selected one) |
| `o` | Open the selected item in your browser |
| `/` | Filter courses, including previous semesters |
| `r` | Refresh |
| `esc` | Back, close, clear |
| `?` | Help |
| `q` | Quit |

The mouse works too: click to select, click again to open, scroll to move.

## Icons

mydy draws its icons with [Nerd Font](https://www.nerdfonts.com) symbols. A program can't change the font your terminal uses, and without a Nerd Font those symbols show as empty boxes. So by default (`"nerdFont": "auto"`) mydy checks, and falls back to plain Unicode symbols (■ □ ▲ ● …) that every font has:

- **Icons on** when your terminal draws them itself (Ghostty, WezTerm and kitty ship the symbols, so there is nothing to install), or when a Nerd Font is installed on this machine.
- **Plain symbols** otherwise. The first time, a one-time note tells you about `--install-font`.

### Getting the full look

```sh
mydy --install-font      # or ./mydy-linux-x64 --install-font, for the downloaded binary
```

Downloads JetBrainsMono Nerd Font v3.4.0 (Regular and Bold, under the SIL Open Font License, with a copy of the license), checks each file against a checksum pinned in the source, and installs it for your user only: `~/.local/share/fonts/MyDy` on Linux, `~/Library/Fonts` on macOS, `%LOCALAPPDATA%\Microsoft\Windows\Fonts` on Windows (also registered for your user). No admin rights, and files already installed are skipped.

Then **select "JetBrainsMono Nerd Font" in your terminal's font settings**. mydy tells you where for the terminal you're in, but never edits your terminal's config. Pick the regular variant, not **Mono**, which shrinks icons to one cell. Until you have, icons show as boxes: run with `--no-nerd-font` in the meantime.

### Overriding detection

The first of these wins:

| | |
|---|---|
| `--nerd-font` / `--no-nerd-font` | This run only |
| `MYDY_NERD_FONT=1` / `0` (`auto` too) | Environment or `.env` |
| `"nerdFont": true` / `false` / `"auto"` | Config file, below |
| Auto-detection | The default |

Detection can only see which fonts are installed, not which one your terminal has selected. If icons show as boxes, set `MYDY_NERD_FONT=0`; if you see plain symbols but have a Nerd Font, set it to `1`. Over ssh the fonts on the server say nothing about your terminal, so auto uses plain symbols there unless `TERM` names Ghostty, WezTerm or kitty.

## Configuration

Optional, in `~/.config/mydy/config.json` (Windows: `%APPDATA%\mydy\config.json`):

```json
{ "downloadDir": "~/Downloads/MyDy", "nerdFont": "auto", "threshold": 75, "animations": true }
```

`threshold` is the attendance requirement in percent. `nerdFont` is `true`, `false` or `"auto"` (see Icons). `animations` lets the dithered wave texture in the header and on the sign-in screen drift; `false` keeps it still, as do `--no-animations` (this run only) and `MYDY_ANIMATIONS=0`.

Downloads go to `<downloadDir>/<course name>/`, skipping files you already have.
