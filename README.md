# MyDy LMS Helper

A terminal UI application and MCP server for interacting with the MyDy (Moodle-based) LMS at D.Y. Patil institutions. View attendance, browse courses, check assignments and grades, read announcements, and download course materials.

## Screenshots
<img width="2446" height="1466" alt="MyDy_LMS_Helper_2026-03-21T02_48_44_883104" src="https://github.com/user-attachments/assets/698580e6-2893-40e2-b863-b1b06dd753a7" />
<img width="2446" height="1466" alt="MyDy_LMS_Helper_2026-03-21T02_50_00_030190" src="https://github.com/user-attachments/assets/5295fe80-7b84-43fa-9a4e-83f5d6cdd9b0" />
<img width="2446" height="1466" alt="MyDy_LMS_Helper_2026-03-21T02_50_03_617570" src="https://github.com/user-attachments/assets/df05d709-cff0-47be-90a7-85b439940325" />
<img width="2446" height="1466" alt="MyDy_LMS_Helper_2026-03-21T02_50_07_599421" src="https://github.com/user-attachments/assets/da366e58-5dcc-4b10-a3ca-e7a80ee1c4de" />
<img width="2446" height="1466" alt="MyDy_LMS_Helper_2026-03-21T02_50_21_603458" src="https://github.com/user-attachments/assets/9a474387-ff04-4b87-b787-d2f5545652fe" />
<img width="2446" height="1466" alt="MyDy_LMS_Helper_2026-03-21T02_50_11_961475" src="https://github.com/user-attachments/assets/7495c62f-84ff-4251-85fc-d900c3bff58a" />
<img width="2446" height="1466" alt="MyDy_LMS_Helper_2026-03-21T02_51_47_161948" src="https://github.com/user-attachments/assets/1caedfd3-7b27-459c-b100-866a4e5a23f8" />

## Features

- **Dashboard** — Attendance summary + current semester courses at a glance
- **Course Detail** — Tabbed view with Content, Assignments, Grades, and Announcements
- **Download Materials** — Download from a single course or bulk download from multiple
- **Login Screen** — Auto-login from `.env` or manual login via the UI
- **MCP Server** — Let AI assistants interact with your LMS

## Setup

### 1. Clone and install

```sh
git clone https://github.com/your-username/mydy-lms-helper.git
cd mydy-lms-helper
python -m venv .venv
source .venv/bin/activate  # Linux/Mac
# .venv\Scripts\activate   # Windows
uv pip install -r requirements.txt
# or: pip install -r requirements.txt
```

### 2. Configure credentials (optional)

Create a `.env` file:
```
MYDY_USERNAME="your_email@dypatil.edu"
MYDY_PASSWORD="your_password"
```

If no `.env` is present, the app will show a login screen on startup.

### 3. Run the TUI

```sh
python __main__.py
```

### Navigation

| Key / Action | What it does |
|---|---|
| Click sidebar items | Switch between Dashboard, All Courses, Bulk Download |
| Click a course | Open course detail page with tabs |
| `Back` button | Return to previous view |
| `Download Materials` | Download all files from the current course |
| `q` | Quit |

---

## MCP Server

The project also includes an MCP (Model Context Protocol) server for AI assistants like Claude Code.

### Quick Setup with Claude Code

```sh
claude mcp add mydy-lms -e MYDY_USERNAME=your_email@dypatil.edu -e MYDY_PASSWORD=your_password -- python /path/to/mcp_server.py
```

### Manual Config

```json
{
  "mcpServers": {
    "mydy-lms": {
      "command": "python",
      "args": ["/path/to/mcp_server.py"],
      "env": {
        "MYDY_USERNAME": "your_email@dypatil.edu",
        "MYDY_PASSWORD": "your_password"
      }
    }
  }
}
```

### Available MCP Tools

| Tool | Description |
|------|-------------|
| `login` | Authenticate with the LMS portal |
| `list_courses` | List all enrolled courses |
| `get_course_content` | List sections and activities in a course |
| `get_assignments` | View assignments with due dates and submission status |
| `get_grades` | Fetch grade report for a course |
| `get_announcements` | Read course announcements |
| `get_attendance` | View attendance summary for current semester |
| `download_course_materials` | Download materials from specific or all courses |

---

## Project Structure

```
mydy-lms-helper/
├── __main__.py       # Entry point
├── app.py            # Textual TUI application
├── client.py         # HTTP client (shared by TUI and MCP server)
├── mcp_server.py     # MCP server for AI assistants
├── requirements.txt  # Dependencies
└── .env              # Credentials (gitignored)
```

## Requirements
- Python 3.10+
- Internet connection
- Valid MyDy LMS account

## License
MIT License. Use at your own risk.

## Disclaimer
This tool is for educational purposes only. Respect your institution's terms of service and use responsibly. Only download content you have legitimate access to. This project is unofficial and made for personal/educational use. DY Patil or MyDY is not associated with this project.

Use responsibly. The author is not responsible for misuse, data loss, or violations of institutional policies.
