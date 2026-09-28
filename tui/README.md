# Terminal UI

Attendance, deadlines, grades, announcements and course files from MyDy on one screen. Part of [MyDy LMS Helper](../README.md).

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
| `↑` `↓` / `j` `k` | Move |
| `enter` | Open the course, read an announcement |
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

Icons need a [Nerd Font](https://www.nerdfonts.com). Use the regular variant (e.g. **JetBrainsMono Nerd Font**), not **Mono**, which shrinks icons to one cell. In Ghostty set `font-family = JetBrainsMono Nerd Font`. No Nerd Font? Run with `--no-nerd-font`.

## Configuration

Optional, in `~/.config/mydy/config.json` (Windows: `%APPDATA%\mydy\config.json`):

```json
{ "downloadDir": "~/Downloads/MyDy", "nerdFont": true, "threshold": 75 }
```

Downloads go to `<downloadDir>/<course name>/`, skipping files you already have.
