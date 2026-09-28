# MCP server

Lets Claude Code, Claude Desktop or any [MCP](https://modelcontextprotocol.io/) client read your MyDy courses, attendance, deadlines, grades and announcements, and download your notes. Part of [MyDy LMS Helper](../README.md).

## Set up

```sh
git clone https://github.com/Deeptanshuu/mydy-lms-helper.git
cd mydy-lms-helper
python3 -m venv .venv
.venv/bin/pip install -r mcp/requirements.txt
```

**Claude Code** (run from the repo folder):

```sh
claude mcp add mydy-lms \
  -e MYDY_USERNAME=your_email@dypatil.edu \
  -e MYDY_PASSWORD=your_password \
  -- "$PWD/.venv/bin/python" "$PWD/mcp/mcp_server.py"
```

**Other clients:**

```json
{
  "mcpServers": {
    "mydy-lms": {
      "command": "/path/to/mydy-lms-helper/.venv/bin/python",
      "args": ["/path/to/mydy-lms-helper/mcp/mcp_server.py"],
      "env": { "MYDY_USERNAME": "your_email@dypatil.edu", "MYDY_PASSWORD": "your_password" }
    }
  }
}
```

Use the virtualenv's Python: a bare `python` usually isn't on the PATH MCP clients see.

## Tools

| Tool | Does |
|---|---|
| `login` | Sign in |
| `list_courses` | Every enrolled course |
| `get_course_content` | A course's sections and activities |
| `get_assignments` | Due dates and submission status |
| `get_grades` | A course's grade report |
| `get_announcements` | A course's announcements |
| `get_attendance` | This semester's attendance |
| `download_course_materials` | Files from one, several or all courses |

Try: *"What's due this week, and which subjects am I short on?"*
