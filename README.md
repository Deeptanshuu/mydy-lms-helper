# MyDy LMS Helper

A terminal UI application and MCP server for interacting with the MyDy (Moodle-based) LMS at D.Y. Patil institutions. View attendance, browse courses, check assignments and grades, read announcements, and download course materials.

## Screenshots

<img width="1906" height="994" alt="Screenshot 2025-09-19 000702" src="https://github.com/user-attachments/assets/c241827c-c2f0-4e7e-98d6-20a13fb4cf4a" />
<img width="1886" height="997" alt="Screenshot 2025-09-19 000803" src="https://github.com/user-attachments/assets/b2b19e50-4529-40a3-803b-0968641da54c" />
<img width="1902" height="935" alt="Screenshot 2025-09-19 000822" src="https://github.com/user-attachments/assets/17e5f034-43e9-4972-8dad-e970fba92879" />

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
