<div align="center">

<img src="docs/assets/banner.svg" alt="MyDy LMS Helper: attendance, grades, assignments and course files from the MyDy portal" width="100%">

<br>
<br>

**[Website and live demo](https://deeptanshuu.github.io/mydy-lms-helper/)** &nbsp;&nbsp;|&nbsp;&nbsp; **[Releases](https://github.com/Deeptanshuu/mydy-lms-helper/releases)**

</div>

<br>

<img alt="The terminal UI: your courses with attendance on the left, the selected course's attendance, deadlines, grade and files on the right" src="docs/assets/tui-dashboard.svg" width="100%">

MyDy, the D.Y. Patil LMS, in your terminal: attendance, deadlines and grades on one screen, every course's notes in one download, your SGPA and CGPA from UniClaIRE, and your AI assistant plugged into all of it.

| Part | What it does | Folder |
|---|---|---|
| **Terminal UI** | An overview of your semester, every course on one screen, your SGPA and CGPA, bulk downloads, works offline | `tui/` |
| **MCP server** | Ask Claude or any MCP client about your courses and results, and max your Course Progress | `mcp/` |
| **Chrome extension** | Download course files from the browser | `extension/` |

Each folder has its own README with setup and details.

<img src="docs/assets/how-it-works.svg" alt="The terminal UI and MCP server log in and parse MyDy's pages over HTTP; the Chrome extension reuses your logged-in browser tab" width="100%">

## Quick start

macOS and Linux:

```sh
curl -fsSL https://deeptanshuu.github.io/mydy-lms-helper/install.sh | sh
```

Windows (PowerShell):

```powershell
irm https://deeptanshuu.github.io/mydy-lms-helper/install.ps1 | iex
```

Then run `mydy`. Binaries are also on [Releases](https://github.com/Deeptanshuu/mydy-lms-helper/releases), or run from source with [Bun](https://bun.com):

```sh
git clone https://github.com/Deeptanshuu/mydy-lms-helper.git
cd mydy-lms-helper && bun install && bun run tui
```

Contributing: see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT. Unofficial, not affiliated with D.Y. Patil or MyDy. Your logins are only sent to MyDy and UniClaIRE; only download what you already have access to.
