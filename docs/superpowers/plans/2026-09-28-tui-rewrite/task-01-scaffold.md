### Task 1: Scaffold workspaces, move the MCP server, core types and HTML helpers

Read the global rules in `docs/superpowers/plans/2026-09-28-tui-rewrite.md` first.

**Files:**
- Move: `tui/mcp_server.py` -> `mcp/mcp_server.py`, `tui/requirements.txt` -> `mcp/requirements.txt`
- Modify: `mcp/requirements.txt`, `.gitignore`
- Create: `package.json`, `core/package.json`, `core/tsconfig.json`, `core/src/types.ts`, `core/src/errors.ts`, `core/src/html.ts`, `core/src/transport.ts`, `core/test/dom.ts`, `core/test/html.test.ts`, `tui/package.json`, `tui/tsconfig.json`, `tui/bunfig.toml`

**Interfaces:**
- Consumes: nothing.
- Produces (used by every later task):
  - `@mydy/core/types`: `Course`, `AttendanceSubject`, `Attendance`, `Activity`, `Section`, `Assignment`, `GradeItem`, `GradeReport`, `AnnouncementSummary`, `Announcement`, `FileSource`, `FileRef`, `LoginResult`
  - `core/src/errors.ts`: `MydyError`, `NetworkError`, `SessionExpiredError`, `LoginFailedError`, `UnexpectedPageError` (all `(message: string, url?: string)`)
  - `core/src/html.ts`: `text(el): string`, `abs(href, base): string`, `activityName(el): string`, `courseName(doc): string`
  - `core/src/transport.ts`: `Page { url; status; html }`, `Transport { get(url): Promise<Page>; post(url, form): Promise<Page>; download(url): Promise<Response> }`
  - `core/test/dom.ts`: `parse(html): Document` (linkedom, for tests)
  - Package export map in `core/package.json`: `"."` -> `src/index.ts` (created in Task 6), `"./types"`, `"./logic"` (Task 2), `"./bun"` (Task 5)

- [ ] **Step 1: Move the MCP server**

```bash
mkdir -p mcp
git mv tui/mcp_server.py mcp/mcp_server.py
git mv tui/requirements.txt mcp/requirements.txt
```

Replace `mcp/requirements.txt` with exactly (the server only imports `requests`, `bs4` and `mcp`):

```
beautifulsoup4==4.13.4
requests==2.32.3
mcp>=1.0.0
```

- [ ] **Step 2: Replace `.gitignore`**

The old file ignored `*.json` and `*.html` everywhere, which would hide `package.json` and `tsconfig.json`. Downloads no longer land in the repo (the new TUI saves to `~/Downloads/MyDy`); only the Python MCP server still saves into its working directory.

```gitignore
.DS_Store
.env

# Bun / TypeScript
node_modules/
dist/

# Python (MCP server)
/venv/
/.venv/
/build/
*.spec
__pycache__/
*.pyc

# Course materials the Python MCP server downloads into its working directory
*.pdf
*.ppt
*.pptx
*.doc
*.docx
*.xlsx
/*.csv
/*.html
/*.xml
/*.json
!/package.json

# Brainstorming companion mockups
.superpowers/
```

- [ ] **Step 3: Root `package.json`**

```json
{
  "name": "mydy-lms-helper",
  "private": true,
  "workspaces": ["core", "tui"],
  "scripts": {
    "tui": "bun run --cwd tui start",
    "test": "bun run --cwd core test && bun run --cwd tui test",
    "typecheck": "bun run --cwd core typecheck && bun run --cwd tui typecheck",
    "smoke": "bun run --cwd core smoke",
    "build": "bun run --cwd tui build"
  }
}
```

- [ ] **Step 4: `core/package.json` and `core/tsconfig.json`**

```json
{
  "name": "@mydy/core",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./types": "./src/types.ts",
    "./logic": "./src/logic.ts",
    "./bun": "./src/bun.ts"
  },
  "scripts": {
    "test": "bun test",
    "typecheck": "tsc --noEmit",
    "smoke": "bun --env-file=../.env scripts/smoke.ts"
  },
  "dependencies": {
    "linkedom": "0.18.13"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "typescript": "^5.6.0"
  }
}
```

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ESNext", "DOM", "DOM.Iterable"],
    "types": ["bun"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true
  },
  "include": ["src", "test", "scripts"]
}
```

- [ ] **Step 5: `core/src/types.ts`**

```ts
export interface Course {
  id: string
  name: string
  url: string
}

export interface AttendanceSubject {
  subject: string
  total: number
  present: number
  absent: number
  /** Percentage as MyDy reports it, or null if it wasn't a number. */
  percentage: number | null
}

export interface Attendance {
  batch: string | null
  semester: string | null
  subjects: AttendanceSubject[]
}

export interface Activity {
  name: string
  /** Moodle module type from the `modtype_<type>` class, e.g. "resource", "assign". */
  type: string
  url: string
}

export interface Section {
  number: number | null
  name: string
  activities: Activity[]
}

export interface Assignment {
  name: string
  url: string
  dueText: string | null
  due: Date | null
  submissionStatus: string | null
  gradingStatus: string | null
  grade: string | null
  timeRemaining: string | null
  submitted: boolean
}

export interface GradeItem {
  name: string
  grade: string | null
  range: string | null
  percentage: string | null
  feedback: string | null
}

export interface GradeReport {
  courseName: string
  items: GradeItem[]
  total: GradeItem | null
}

export interface AnnouncementSummary {
  title: string
  url: string
  author: string | null
  dateText: string | null
}

export interface Announcement extends AnnouncementSummary {
  content: string | null
}

export type FileSource = "direct" | "flexpaper" | "presentation" | "iframe" | "object"

export interface FileRef {
  url: string
  filename: string
  source: FileSource
}

export interface LoginResult {
  maskedUser: string
}
```

- [ ] **Step 6: `core/src/errors.ts` and `core/src/transport.ts`**

```ts
export class MydyError extends Error {
  constructor(
    message: string,
    readonly url?: string,
  ) {
    super(message)
    this.name = new.target.name
  }
}

/** The request never got a response (offline, DNS, refused, too many redirects). */
export class NetworkError extends MydyError {}
/** MyDy redirected a signed-in request to its login page or home page. */
export class SessionExpiredError extends MydyError {}
/** Sign-in was rejected or the sign-in form couldn't be found. */
export class LoginFailedError extends MydyError {}
/** MyDy answered, but not with a page the parser recognises (4xx/5xx, error box). */
export class UnexpectedPageError extends MydyError {}
```

```ts
export interface Page {
  /** Final URL after redirects. */
  url: string
  status: number
  html: string
}

export interface Transport {
  get(url: string): Promise<Page>
  post(url: string, form: Record<string, string>): Promise<Page>
  /** Streams a file. The caller must consume or cancel the body. */
  download(url: string): Promise<Response>
}
```

- [ ] **Step 7: Write the failing test `core/test/html.test.ts` and helper `core/test/dom.ts`**

```ts
// core/test/dom.ts
import { DOMParser } from "linkedom"

export function parse(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html") as unknown as Document
}
```

```ts
// core/test/html.test.ts
import { describe, expect, test } from "bun:test"
import { abs, activityName, courseName, text } from "../src/html"
import { parse } from "./dom"

describe("html helpers", () => {
  test("text collapses whitespace and tolerates null", () => {
    expect(text(parse("<html><body><p>  a \n  b </p></body></html>").querySelector("p"))).toBe("a b")
    expect(text(null)).toBe("")
  })

  test("abs resolves relative links against the page URL", () => {
    expect(abs("/rait/mod/resource/view.php?id=1", "https://mydy.dypatil.edu/rait/my/")).toBe(
      "https://mydy.dypatil.edu/rait/mod/resource/view.php?id=1",
    )
  })

  test("activityName drops the screen-reader suffix", () => {
    const doc = parse(
      `<html><body><ul><li class="activity"><a href="/x"><span class="instancename">Lecture 1<span class="accesshide"> File</span></span></a></li></ul></body></html>`,
    )
    expect(activityName(doc.querySelector("li")!)).toBe("Lecture 1")
  })

  test("activityName falls back to the link's own text", () => {
    const doc = parse(`<html><body><ul><li><a href="/x">Syllabus <span class="badge">New</span></a></li></ul></body></html>`)
    expect(activityName(doc.querySelector("li")!)).toBe("Syllabus")
  })

  test("courseName reads the page title", () => {
    expect(courseName(parse("<html><head><title>Course: Computer Networks</title></head><body></body></html>"))).toBe(
      "Computer Networks",
    )
    expect(courseName(parse("<html><head></head><body></body></html>"))).toBe("Unknown course")
  })
})
```

- [ ] **Step 8: Install and see the test fail**

Create `tui/package.json`, `tui/tsconfig.json` and `tui/bunfig.toml` first (Step 9) so the workspace resolves, then:

Run: `bun install && bun test --cwd core`
Expected: FAIL, `Cannot find module '../src/html'`.

- [ ] **Step 9: TUI package files**

`tui/package.json`:

```json
{
  "name": "@mydy/tui",
  "version": "6.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "bun src/index.tsx",
    "test": "bun test",
    "typecheck": "tsc --noEmit",
    "build": "bun scripts/build.ts"
  },
  "dependencies": {
    "@mydy/core": "workspace:*",
    "@opentui/core": "0.5.12",
    "@opentui/solid": "0.5.12",
    "solid-js": "1.9.12"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "typescript": "^5.6.0"
  }
}
```

`tui/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ESNext", "DOM", "DOM.Iterable"],
    "types": ["bun"],
    "jsx": "preserve",
    "jsxImportSource": "@opentui/solid",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["src", "test", "scripts"]
}
```

`tui/bunfig.toml`:

```toml
preload = ["@opentui/solid/preload"]

[test]
preload = ["@opentui/solid/preload"]
```

- [ ] **Step 10: Implement `core/src/html.ts`**

```ts
/** Visible text with runs of whitespace collapsed; "" for a missing element. */
export function text(el: Element | Node | null | undefined): string {
  return (el?.textContent ?? "").replace(/\s+/g, " ").trim()
}

export function abs(href: string, base: string): string {
  return new URL(href, base).toString()
}

/** Activity title without Moodle's hidden screen-reader suffix (" File", " Forum", ...). */
export function activityName(el: Element): string {
  const span = el.querySelector("span.instancename")
  if (span) {
    const clone = span.cloneNode(true) as Element
    clone.querySelectorAll("span.accesshide").forEach((n) => n.remove())
    return text(clone)
  }
  const link = el.querySelector("a[href]")
  if (!link) return ""
  const own = Array.from(link.childNodes)
    .filter((n) => n.nodeType === 3)
    .map((n) => n.textContent ?? "")
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
  return own || text(link)
}

/** Course name from a page title such as "Course: Computer Networks". */
export function courseName(doc: Document): string {
  const title = text(doc.querySelector("title"))
  if (!title) return "Unknown course"
  const i = title.indexOf("Course:")
  return i >= 0 ? title.slice(i + "Course:".length).trim() : title
}
```

- [ ] **Step 11: Run the tests**

Run: `bun test --cwd core`
Expected: 5 pass, 0 fail.

- [ ] **Step 12: Check the workspace resolves**

Run: `bun -e 'import("@opentui/solid").then(() => console.log("ok"))' --cwd tui`
Expected: `ok`. Also confirm `bun.lock` exists at the repo root and `git status` shows `package.json`, `core/`, `tui/package.json`, `tui/tsconfig.json`, `tui/bunfig.toml`, `mcp/` as new/changed (none ignored).
