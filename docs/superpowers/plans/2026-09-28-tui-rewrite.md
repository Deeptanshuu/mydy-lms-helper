# MyDy TUI Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Each task lives in its own file under `docs/superpowers/plans/2026-09-28-tui-rewrite/`; an implementer only needs this file (for the global rules) and their task file.

**Goal:** Replace the Python/Textual TUI with an OpenTUI (Solid) app built on a new shared TypeScript core, move the Python MCP server to `mcp/`, and rebrand the README artwork.

**Architecture:** Bun workspaces `core/` (pure TypeScript MyDy client: transport interface, DOM-only parsers, derived maths) and `tui/` (OpenTUI Solid app: store, sync orchestrator, downloader, views). The Bun-specific transport and linkedom parser live in `core/src/bun.ts` so the rest of core can later run in the Chrome extension.

**Tech Stack:** Bun 1.3.14, TypeScript 5, `@opentui/core` + `@opentui/solid` 0.5.12, `solid-js` 1.9.12, `linkedom` 0.18.13, `bun test`.

**Spec:** `docs/superpowers/specs/2026-09-28-tui-rewrite-design.md`

## Global Constraints

- Runtime: Bun >= 1.3.0 (developed on 1.3.14). No Node-only APIs in `tui/`; `core/src` (except `bun.ts`) uses only standard web/DOM APIs.
- Pin exactly: `@opentui/core@0.5.12`, `@opentui/solid@0.5.12`, `solid-js@1.9.12`, `linkedom@0.18.13`.
- Colours only from the brand tokens in `tui/src/theme.ts` (values in the spec table). Accent `#FF6500` is used only for selection, the active tab, keys and "needs you".
- No emoji anywhere (UI, README, commit messages). Icons come from `tui/src/icons.ts`; every icon occupies a 3-cell slot: glyph + 2 spaces (`slot()`).
- Nerd Font icons by default; `--no-nerd-font` flag or config `nerdFont: false` switches to the Unicode set.
- Request pacing: one request at a time, 500 ms between requests, 600 ms before file downloads.
- User-facing copy: sentence case, plain verbs, errors say what happened and what to do; never apologise.
- OpenTUI Solid conventions (verified by spike): `<text fg attributes>`; coloured inline text is `<span style={{ fg, bg }}>` (a bare `fg` prop on `<span>` is ignored); bold inline text is `<b>`; boxes use `backgroundColor`, `padding*`, `flex*`, `position="absolute"`, `top/left/right`, `zIndex`. Keys arrive via `useKeyboard(k => ...)` with `k.name` values `return`, `escape`, `tab` (`k.shift` for shift+tab), `space`, `up`, `down`, `left`, `right`, `backspace`, letters, and `k.sequence` for `?` and `/`. In tests, after `mockInput.pressEscape()` call `await t.renderOnce()` before pressing another key (escape + next key otherwise merge into one alt-sequence).
- Compiled binaries must pass `autoloadBunfig: false, autoloadDotenv: false` to `Bun.build({ compile })` (otherwise a `bunfig.toml` in the user's working directory breaks startup).
- Do not commit unless the controller says so (the branch has a pending merge; the first commit concludes it).
- Never add Claude as a commit co-author.

## Review Focus

1. **Real MyDy HTML differs from the synthetic fixtures.** A person expects their real courses, attendance and files to show up. Pinned by the live smoke check in Task 13 (`bun run smoke`), which must report non-zero courses and attendance subjects for the account in `.env`.
2. **Terminal without a Nerd Font.** Expect clean Unicode symbols, columns still aligned. Pinned by the `nerd: false` render test in Task 9 (every course name starts in the same column).
3. **Course with no attendance record, or zero classes held.** Expect "No attendance record for this course", no `NaN%`, no division by zero. Pinned by `attendanceMath(0, 0)` in Task 2 and the no-attendance render test in Task 9.
4. **Long course names on an 80-column terminal.** Expect truncation with `…`, panes stacked, nothing wrapping onto the next row. Pinned by the 80x30 render test in Task 10.
5. **Download cancelled or failing midway.** Expect no half-written file under the real filename, so the next run re-downloads it. Pinned by the abort test in Task 8 (only a removed `.part`, no final file).

## Waves (parallel dispatch)

| Wave | Tasks (parallel within a wave) | Depends on |
|---|---|---|
| 0 | 1 Scaffold | none |
| 1 | 2 Core maths, 3 Core parsers A, 4 Core parsers B, 5 Bun transport, 7 TUI foundation, 12 README artwork | 1 |
| 2 | 6 Core client, 8 TUI state, sync and downloads | 3, 4, 5 (for 6); 2, 7 (for 8) |
| 3 | 9 TUI main views | 8 |
| 4 | 10 TUI overlays, sign-in, app shell and keys | 9 |
| 5 | 11 Entry, build, CI, remove Python TUI; 14 README text and screenshot | 6, 10 |
| 6 | 13 Live smoke and final verification (controller) | all |

## Tasks

| # | File | Deliverable |
|---|---|---|
| 1 | `2026-09-28-tui-rewrite/task-01-scaffold.md` | Workspaces, `mcp/` move, `.gitignore`, core types/errors/html helpers |
| 2 | `2026-09-28-tui-rewrite/task-02-core-maths.md` | Attendance maths, dates, needs-you, attendance matching |
| 3 | `2026-09-28-tui-rewrite/task-03-core-parsers-a.md` | Login form, dashboard courses, attendance, course content, assignment links, forum link |
| 4 | `2026-09-28-tui-rewrite/task-04-core-parsers-b.md` | Assignment page, grades, discussion list and post, activity files |
| 5 | `2026-09-28-tui-rewrite/task-05-bun-transport.md` | Cookie jar, manual redirects, pacing, linkedom parser |
| 6 | `2026-09-28-tui-rewrite/task-06-core-client.md` | `MydyClient`, fake MyDy server, smoke script |
| 7 | `2026-09-28-tui-rewrite/task-07-tui-foundation.md` | Theme, icons, format helpers, paths, config, `.env`, credentials, cache |
| 8 | `2026-09-28-tui-rewrite/task-08-tui-state.md` | Store, derive helpers, sync orchestrator, downloader |
| 9 | `2026-09-28-tui-rewrite/task-09-tui-views.md` | Context, top bar, needs-you strip, course list, course detail and tabs, footer |
| 10 | `2026-09-28-tui-rewrite/task-10-tui-shell.md` | Sign-in, help, toast, download drawer, app shell, key handling |
| 11 | `2026-09-28-tui-rewrite/task-11-entry-build.md` | `index.tsx`, build script, CI workflow, Python TUI removal |
| 12 | `2026-09-28-tui-rewrite/task-12-readme-artwork.md` | Rebranded `banner.svg`, `how-it-works.svg`, badge colours |
| 13 | `2026-09-28-tui-rewrite/task-13-verify.md` | Live smoke, full test run, compiled binary check |
| 14 | `2026-09-28-tui-rewrite/task-14-readme-text.md` | TUI screenshot SVG generator, README and spec text updates |
