# MyDy TUI rewrite: shared TypeScript core + OpenTUI app

Date: 2026-09-28
Status: approved, implemented

## Why

The project has four visual identities (glossy indigo icon, orange-on-black Textual TUI, shadcn-style extension popup, indigo README) and three copies of the scraping logic (`tui/client.py`, `tui/mcp_server.py`, `extension/js/content.js`). The TUI's UX is mouse-driven, lists subjects twice, clips attendance, and hides downloads on a separate screen.

This project replaces the Python/Textual TUI with an OpenTUI app built on a new TypeScript core that the Chrome extension will adopt next, and sets the brand every surface will share.

## Scope

In scope:

1. `core/`: TypeScript MyDy client and parsers, runnable in Bun and (later) the browser.
2. `tui/`: new OpenTUI (Solid) app, replacing `tui/app.py` and `tui/client.py`.
3. Move the Python MCP server to `mcp/` (unchanged behaviour).
4. Rebrand README artwork (`docs/assets/*.svg`) and badges to the new palette.
5. CI: build TUI binaries with `bun build --compile`; keep the extension workflow working.

Out of scope (later sub-projects): moving the extension onto `core/` and restyling it, porting the MCP server to TypeScript, redrawing the app icon.

## Brand

Structure "Highlighter": a single accent used as a solid highlight with dark text, only for what's selected or needs attention. Panes are separated by a slightly lighter panel colour, not lines.

| Token | Hex | Use |
|---|---|---|
| `bg` | `#0E0F10` | screen background |
| `panel` | `#17191B` | course list pane, inputs, overlays |
| `bar` | `#08090A` | top bar, footer |
| `strip` | `#1C1E21` | "needs you" strip, pinned totals |
| `line` | `#2C2F33` | bar tracks, modal edges, skeletons |
| `text` | `#D8DCDF` | body text |
| `strong` | `#F4F5F6` | headings |
| `muted` | `#8A9096` | secondary text |
| `accent` | `#FF6500` | selection, active tab, keys, "needs you" |
| `onAccent` | `#08090A` | text on accent |
| `ok` | `#6FCF97` | attendance >= 75% |
| `warn` | `#F2C94C` | 50% to 75%, due soon |
| `low` | `#F0506E` | < 50%, not submitted, errors |

Icons: Nerd Font Material Design glyphs by default, Unicode fallback via `--no-nerd-font` or config `nerdFont: false`. Every icon occupies a fixed 3-cell slot (glyph + 2 spaces) so labels line up in a column. No emoji anywhere.

| Meaning | Nerd Font | Unicode |
|---|---|---|
| app | `nf-md-school` | `◆` |
| courses | `nf-md-book_open_variant` | (none) |
| marked / unmarked | `nf-md-checkbox_marked` / `nf-md-checkbox_blank_outline` | `■` / `□` |
| deadline | `nf-md-calendar_clock` | `◷` |
| needs you / error | `nf-md-alert` | `▲` |
| attendance | `nf-md-chart_bar` | (none) |
| files, assignments, grades, announcements tabs | `nf-md-folder`, `nf-md-clipboard_text_outline`, `nf-md-star_outline`, `nf-md-bullhorn` | (none) |
| section | `nf-md-folder_outline` | `▾` |
| pdf / ppt / doc / other file | `nf-md-file_pdf_box`, `nf-md-file_powerpoint_box`, `nf-md-file_document_outline` | `pdf`, `ppt`, `doc` labels |
| done | `nf-md-check` | `✓` |
| download, downloading | `nf-md-download`, `nf-md-progress_download` | `↓` |
| refresh | `nf-md-refresh` | `↻` |
| filter | `nf-md-magnify` | `/` |
| collapsed group | `nf-md-chevron_right` | `▸` |
| keys | `nf-md-keyboard` | (none) |

Spacing: 2-column outer gutter; blank row between top bar, strip and panes; 2 columns padding inside the course pane, 3 inside the detail pane; blank row between groups.

Reference mockups: `.superpowers/brainstorm/5363-1790617291/content/` (`icons-padding.html`, `views-v2.html`, `highlighter-orange-dark.html`).

## Repository layout

```
package.json            Bun workspaces: core, tui
core/                   @mydy/core
tui/                    @mydy/tui (TypeScript; replaces app.py, client.py, __main__.py)
mcp/                    Python MCP server (mcp_server.py, requirements.txt) moved from tui/
extension/              unchanged in this project
docs/assets/            README artwork (rebranded)
```

`tui/icons/` (PyInstaller icons) is removed; the compiled binaries have no custom icon.

## core/

Pure TypeScript, no Bun-only APIs outside `transport/bun.ts`, so the extension can import the rest.

### Transport

```ts
interface Transport {
  get(url: string): Promise<Page>
  post(url: string, form: Record<string, string>): Promise<Page>
  download(url: string): Promise<Response>   // streamed body
}
interface Page { url: string; status: number; html: string }
```

- `createBunTransport()`: keeps a cookie jar (per host, from `headers.getSetCookie()`), follows redirects manually (`redirect: "manual"`, max 10) so cookies set mid-redirect are kept, and sends a desktop browser User-Agent.
- Pacing: a queue that runs one request at a time with 500 ms between requests (matches the Python client), 600 ms for file downloads.
- The browser transport (`fetch` with `credentials: "include"`) is added when the extension adopts the core.

### Parsing

`parseHtml(html): Document` uses linkedom in Bun and `DOMParser` in the browser, chosen by an injected function. Parsers take a `Document` and the page URL and return typed data; they use only standard DOM APIs (`querySelector`, `textContent`, `getAttribute`) and never fetch.

Ports of the Python logic, one file each under `core/src/parse/`: `loginForm`, `courses` (dashboard `/my/`), `attendance` (`blocks/academic_status/ajax.php?action=attendance`), `courseContent` (sections and activities), `assignmentLinks` and `assignment` (submission status table), `grades` (user grade report), `forumLinks`, `discussionList` and `discussion`, `activityFiles` (the five download strategies: pluginfile/extension links, FlexPaper `PDFFile:'...'`, presentation links, `#presentationobject` iframe, `#presentationobject` object).

### Client

```ts
class MydyClient {
  constructor(transport: Transport)
  login(username, password): Promise<LoginResult>   // two-step flow from client.py
  courses(): Promise<Course[]>
  attendance(): Promise<Attendance>
  courseContent(courseId): Promise<Section[]>
  assignments(courseId): Promise<Assignment[]>        // fetches each assignment page
  grades(courseId): Promise<GradeReport>
  announcements(courseId, limit = 10): Promise<AnnouncementSummary[]>  // list only
  announcement(url): Promise<Announcement>            // full post, fetched on open
  resolveFiles(activityUrl): Promise<FileRef[]>
}
```

Errors are typed and thrown, not returned as strings: `NetworkError`, `SessionExpiredError` (redirected to login), `LoginFailedError`, `UnexpectedPageError` (parser found nothing it recognised; carries the URL).

### Derived data (pure functions)

- `attendanceMath(present, total, threshold = 0.75)`: `canMiss = floor(present / threshold - total)` when at or above threshold, otherwise `mustAttend = ceil((threshold * total - present) / (1 - threshold))`.
- `matchAttendance(courses, subjects)`: attaches attendance to courses by normalised name (lowercase, strip punctuation and course codes, then exact, prefix, then token-overlap >= 0.6). Unmatched subjects are kept and listed after the courses.
- Current semester: courses with matched attendance; if none match, the 8 highest course IDs (the old heuristic).
- `parseMoodleDate(text)`: parses dates like "Monday, 6 October 2026, 11:59 PM" in local time; returns `null` if unparseable (shown as the raw text).
- `needsYou(state)`: subjects under 75% and assignments due within 7 days that aren't submitted, sorted by urgency.

## tui/

OpenTUI with `@opentui/solid` (the renderer opencode uses), pinned to 0.5.12. Keys via `useKeyboard`.

### Screens

As in `views-v2.html`:

- **Sign in**: shown only without saved credentials. Email, password, "Remember me on this computer" (on by default), Sign in. Error text in `low`.
- **Main**: top bar (app icon, programme and semester, sync status) / "needs you" strip (hidden when empty) / course pane (current semester, "Previous semesters" collapsed group, marked count) / detail pane (course name, attendance bar with 75% notch and "can miss N" / "attend the next N", tabs Files, Assignments, Grades, Announcements) / footer with the keys for the focused area.
- **Overlays**: download drawer (bottom), help (`?`), filter input (`/`), toast (signed out).

Narrow terminals (< 100 columns): the course pane and detail pane stack; enter opens the detail, esc returns.

### Keys

| Key | Action |
|---|---|
| `↑ ↓` / `j k` | move |
| `enter` | open course / read announcement |
| `esc` | back, close overlay, clear filter |
| `tab` / `shift+tab` | next / previous course tab |
| `space` | mark course for download |
| `d` | download marked courses, or the selected course if none are marked |
| `x` | cancel download |
| `o` | open selected item in the browser; in the download drawer, open the folder |
| `/` | filter courses (all semesters) |
| `r` | refresh |
| `?` | help |
| `q`, `ctrl+c` | quit |

### Data flow

A sync orchestrator runs on start and on `r`, and each stage updates the Solid store as soon as it finishes so the UI fills in progressively:

1. login (saved credentials) -> 2. courses -> 3. attendance -> 4. for each current-semester course: content and assignments (deadlines) -> 5. write cache.

Grades and announcements load when their tab is first opened for a course, then are cached. On `SessionExpiredError` the orchestrator signs in again once and retries; if that fails it shows the "Signed out" toast.

### Local state

| What | Where | Notes |
|---|---|---|
| credentials | `Bun.secrets` (service `mydy-lms-helper`) | `MYDY_USERNAME` / `MYDY_PASSWORD` env vars or `.env` take precedence; if `Bun.secrets` throws (e.g. no libsecret on Linux), fall back to asking each run and say why |
| cache | `~/.cache/mydy/<user-hash>.json` (macOS `~/Library/Caches/mydy`, Windows `%LOCALAPPDATA%\mydy`) | last successful sync; shown immediately on start, dated in the top bar |
| config | `~/.config/mydy/config.json` (Windows `%APPDATA%\mydy`) | `downloadDir` (default `~/Downloads/MyDy`), `nerdFont` (default true), `threshold` (default 75) |
| downloads | `<downloadDir>/<course name>/<file>` | existing file with the same size is skipped; partial files written to `.part` then renamed |

### Offline

If the first request fails with `NetworkError`, the cached data stays on screen, the top bar shows "offline, from <age>", and the strip explains how to retry. Nothing goes blank.

## mcp/

`tui/mcp_server.py` and `tui/requirements.txt` move to `mcp/` unchanged, except `requirements.txt` drops `textual`, `rich` and `pyinstaller`. README MCP config paths are updated. The user's local Claude Code config must be repointed to `mcp/mcp_server.py`.

## README artwork

- `banner.svg`: bg `#0E0F10`; mark = `nf-md-school` glyph drawn as an SVG path in `accent`; title in `strong`; the attendance panel uses `panel`, the new status colours and the 75% notch; component chips outlined in `line`.
- `how-it-works.svg`: same palette; boxes in `panel`, target box edged in `accent`.
- Badges: colour `17191B`, release badges `FF6500`.
- Screenshots: `tui/scripts/screenshot.tsx` renders the app with demo data (Unicode icons) to `docs/assets/tui-dashboard.svg`, `tui-assignments.svg` and `tui-overview.svg` (block and box-drawing characters drawn as shapes).
- README text: TUI install becomes "download a binary" or `bun install && bun run tui`; MCP section points to `mcp/`; project structure and releases updated.

## Build and release

- `bun install` at the root; `bun run tui` for development; `bun test` across workspaces.
- `.github/workflows/tui.yml`: on `v*` tags, installs all OpenTUI native packages (`bun install --os="*" --cpu="*"`), then `Bun.build({ compile: { target } })` for `darwin-arm64`, `darwin-x64`, `linux-x64`, `linux-arm64`, `windows-x64`, and attaches binaries named `mydy-<os>-<arch>` to the release. Next release tag: `v6.0.0`.
- `extension.yml` unchanged.

## Testing

| Layer | How |
|---|---|
| Parsers | `bun test` against synthetic sample pages in `core/test/fixtures/` that reproduce the structure the Python selectors expect (no personal data). Real-page coverage comes from the live smoke check. |
| Transport | a local `Bun.serve` fake of the MyDy login flow (redirect chain setting cookies, session-expired redirect) |
| Derived data | unit tests for attendance maths, matching, date parsing, `needsYou` |
| TUI | `testRender` from `@opentui/solid` with a fake store: snapshot each screen at 120x36 and 80x30, plus key-flow tests (mark and download, filter, tab switching, help) |
| Live smoke | `bun run smoke`: signs in with `.env`, runs every client method once for one course, prints counts. Read-only. Not run in CI. |
| Build | compile the binary for the current platform and run `mydy --version` |

## Risks

- OpenTUI is pre-1.0; pinned to 0.5.12, upgrades done deliberately.
- `Bun.secrets` is experimental; the env/`.env` path always works.
- Parser drift against live MyDy HTML; mitigated by fixtures and the live smoke check.
- Attendance subject names may not match course names; unmatched subjects are shown, not dropped.
