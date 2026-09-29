<div align="center">

<img src="docs/assets/banner.svg" alt="MyDy LMS Helper: attendance, grades, assignments and course files from the MyDy portal" width="100%">

<br>
<br>

**[Website and live demo](https://deeptanshuu.github.io/mydy-lms-helper/)** &nbsp;&nbsp;|&nbsp;&nbsp; **[Releases](https://github.com/Deeptanshuu/mydy-lms-helper/releases)**

</div>

<br>

<img alt="The terminal UI: your courses with attendance on the left, the selected course's attendance, deadlines, grade and files on the right" src="docs/assets/tui-dashboard.svg" width="100%">

A better way to use MyDy, the D.Y. Patil LMS: attendance, deadlines and grades on one screen, every course's notes in one download, and your AI assistant plugged into your courses.

| Part | What it does | Folder |
|---|---|---|
| **Terminal UI** | An overview of your semester, every course on one screen, bulk downloads, works offline | `tui/` |
| **MCP server** | Ask Claude or any MCP client about your courses | `mcp/` |
| **Chrome extension** | Download course files from the browser | `extension/` |

Each folder has its own README with setup and details.

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

MIT. Unofficial, not affiliated with D.Y. Patil or MyDy. Your login is only sent to MyDy; only download what you already have access to.
