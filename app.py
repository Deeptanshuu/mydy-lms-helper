"""
MyDy LMS Helper - Textual TUI Application

Dashboard-first interface with attendance, course browsing,
assignments, grades, announcements, and material downloads.
"""

import os

from textual import work
from textual.app import App, ComposeResult
from textual.binding import Binding
from textual.containers import Center, Horizontal, Middle, Vertical, VerticalScroll
from textual.message import Message
from textual.widgets import (
    Header,
    Footer,
    Static,
    ListView,
    ListItem,
    Label,
    DataTable,
    RichLog,
    ProgressBar,
    LoadingIndicator,
    Button,
    ContentSwitcher,
    Input,
    TabbedContent,
    TabPane,
)
from rich.text import Text

from client import MydyClient

# ---------------------------------------------------------------------------
# Colors
# ---------------------------------------------------------------------------
BG = "#121212"
SURFACE = "#1e1e1e"
SURFACE_2 = "#2a2a2a"
BORDER = "#333333"
PRIMARY = "#FF6500"
TEXT = "#e0e0e0"
MUTED = "#888888"

CURRENT_SEM_COUNT = 8  # top N courses by ID = current semester


# ---------------------------------------------------------------------------
# Login View
# ---------------------------------------------------------------------------

class LoginView(Middle):
    """Login screen with username/password inputs."""

    class LoggedIn(Message):
        def __init__(self, result: dict) -> None:
            self.result = result
            super().__init__()

    def compose(self) -> ComposeResult:
        with Center():
            with Vertical(id="login-card"):
                yield Static(f"[bold {PRIMARY}]MyDy LMS Helper[/]", id="login-title")
                yield Static(f"[{MUTED}]Sign in to your LMS account[/]", id="login-subtitle")
                yield Static("", classes="spacer-sm")
                yield Input(placeholder="Username / Email", id="login-user")
                yield Input(placeholder="Password", password=True, id="login-pass")
                yield Static("", id="login-error")
                yield Button("Login", id="btn-login", variant="warning")

    def on_button_pressed(self, event: Button.Pressed) -> None:
        if event.button.id == "btn-login":
            self._do_login()

    def on_input_submitted(self, event: Input.Submitted) -> None:
        self._do_login()

    def _do_login(self) -> None:
        user = self.query_one("#login-user", Input).value.strip()
        pwd = self.query_one("#login-pass", Input).value.strip()
        if not user or not pwd:
            self.query_one("#login-error", Static).update(f"[red]Please enter both username and password.[/red]")
            return
        self.query_one("#login-error", Static).update(f"[{MUTED}]Logging in...[/]")
        self.query_one("#btn-login", Button).disabled = True
        self.post_message(self.LoggedIn({"username": user, "password": pwd}))

    def show_error(self, msg: str) -> None:
        self.query_one("#login-error", Static).update(f"[red]{msg}[/red]")
        self.query_one("#btn-login", Button).disabled = False


# ---------------------------------------------------------------------------
# Dashboard View
# ---------------------------------------------------------------------------

def _pct_color(pct: float) -> str:
    if pct >= 75:
        return "green"
    elif pct >= 50:
        return "yellow"
    return "red"


def _pct_icon(pct: float) -> str:
    if pct >= 75:
        return "[green]\u25cf[/green]"       # filled circle
    elif pct >= 50:
        return "[yellow]\u25cb[/yellow]"     # hollow circle
    return "[red]\u25cf[/red]"               # filled circle red


def _bar(pct: float, width: int = 20) -> str:
    """Render a colored progress bar using block characters."""
    if not isinstance(pct, (int, float)) or pct < 0:
        return f"[{MUTED}]{'\u2591' * width}[/{MUTED}]"
    filled = int(pct / 100 * width)
    empty = width - filled
    color = _pct_color(pct)
    return f"[{color}]{'\u2588' * filled}[/{color}][{BORDER}]{'\u2591' * empty}[/{BORDER}]"


class DashboardView(VerticalScroll):
    """Main dashboard: attendance + current semester courses."""

    class CourseClicked(Message):
        def __init__(self, course: dict) -> None:
            self.course = course
            super().__init__()

    def compose(self) -> ComposeResult:
        yield Static("", id="dash-welcome")
        yield Static("", id="dash-semester")
        with Horizontal(id="stat-cards"):
            yield Static("", id="stat-courses")
            yield Static("", id="stat-attendance")
            yield Static("", id="stat-present")
        yield Static(f"\n[bold {PRIMARY}]  Attendance[/]", id="att-section-title")
        yield RichLog(id="att-bars", highlight=True, markup=True)
        yield Static(f"\n[bold {PRIMARY}]  Current Semester[/]")
        yield Static(f"[{MUTED}]  Select a course to view details \u2192[/{MUTED}]")
        courses_dt = DataTable(id="dash-courses", cursor_type="row")
        courses_dt.add_columns("#", "Course Name", "Attendance", "")
        yield courses_dt

    def populate(self, attendance: dict | None, courses: list[dict]) -> None:
        # Welcome banner
        self.query_one("#dash-welcome", Static).update(
            f"[bold {PRIMARY}]Welcome back[/bold {PRIMARY}]"
        )

        # Semester info
        if attendance and not isinstance(attendance, str):
            parts = []
            if attendance.get("batch"):
                parts.append(attendance["batch"])
            if attendance.get("semester"):
                parts.append(attendance["semester"])
            self.query_one("#dash-semester", Static).update(
                f"[{MUTED}]{' | '.join(parts)}[/]" if parts else ""
            )

            # Stat cards
            subjects = attendance.get("subjects", [])
            active = [s for s in subjects if isinstance(s["total_classes"], int) and s["total_classes"] > 0]
            total_present = sum(s["present"] for s in active if isinstance(s["present"], int))
            total_classes = sum(s["total_classes"] for s in active)
            avg_pct = (total_present / total_classes * 100) if total_classes > 0 else 0

            self.query_one("#stat-courses", Static).update(
                f"[bold {PRIMARY}]{len(courses)}[/]\n[{MUTED}]Courses[/]"
            )
            self.query_one("#stat-attendance", Static).update(
                f"[bold {PRIMARY}]{len(active)}[/]\n[{MUTED}]Active Subjects[/]"
            )
            avg_color = "green" if avg_pct >= 75 else "yellow" if avg_pct >= 50 else "red"
            self.query_one("#stat-present", Static).update(
                f"[bold {avg_color}]{avg_pct:.0f}%[/]\n[{MUTED}]Avg Attendance[/]"
            )

            # Attendance bars
            bars = self.query_one("#att-bars", RichLog)
            bars.clear()
            bars.write("")
            for s in subjects:
                name = s["subject"]
                pct = s["percentage"]
                if isinstance(pct, (int, float)):
                    bar = _bar(pct, 25)
                    color = _pct_color(pct)
                    icon = _pct_icon(pct)
                    present = s["present"] if isinstance(s["present"], int) else 0
                    total = s["total_classes"] if isinstance(s["total_classes"], int) else 0
                    bars.write(
                        f"  {icon} {name:<36} {bar} [{color}]{pct:>5.1f}%[/{color}]  "
                        f"[{MUTED}]{present}/{total} classes[/{MUTED}]"
                    )
                else:
                    bars.write(f"  [{MUTED}]\u25cb {name:<36} {'.' * 25}   --.--%   --/-- classes[/{MUTED}]")
            bars.write("")
        else:
            self.query_one("#stat-courses", Static).update(
                f"[bold {PRIMARY}]{len(courses)}[/]\n[{MUTED}]Courses[/]"
            )

        # Current semester courses — match attendance data
        att_map: dict[str, dict] = {}
        if attendance and not isinstance(attendance, str):
            for s in attendance.get("subjects", []):
                att_map[s["subject"].lower().strip()] = s

        current = courses[:CURRENT_SEM_COUNT]
        ct = self.query_one("#dash-courses", DataTable)
        ct.clear()
        for i, c in enumerate(current, 1):
            # Try to find matching attendance
            cname = c["name"].lower().strip()
            att = att_map.get(cname)
            if att and isinstance(att["percentage"], (int, float)):
                pct = att["percentage"]
                color = _pct_color(pct)
                icon = _pct_icon(pct)
                att_str = Text.from_markup(f"{icon} [{color}]{pct:.0f}%[/{color}]")
            else:
                att_str = Text.from_markup(f"[{MUTED}]--[/{MUTED}]")
            ct.add_row(str(i), c["name"], att_str, "\u203a", key=c["id"])

    def on_data_table_row_selected(self, event: DataTable.RowSelected) -> None:
        if event.data_table.id == "dash-courses":
            # row_key is the course ID
            cid = str(event.row_key.value)
            table = self.query_one("#dash-courses", DataTable)
            row = table.get_row(event.row_key)
            cname = row[1]  # Course Name column
            self.post_message(self.CourseClicked(
                {"id": cid, "name": cname, "url": f"https://mydy.dypatil.edu/rait/course/view.php?id={cid}"}
            ))


# ---------------------------------------------------------------------------
# All Courses View
# ---------------------------------------------------------------------------

class AllCoursesView(VerticalScroll):
    """Full list of all courses grouped by semester."""

    class CourseClicked(Message):
        def __init__(self, course: dict) -> None:
            self.course = course
            super().__init__()

    def compose(self) -> ComposeResult:
        yield Static(f"[bold {PRIMARY}]All Courses[/]", id="ac-title")
        yield Static("", id="ac-stats")
        yield Static(f"[{MUTED}]Select a course to view details \u2192[/{MUTED}]")
        yield Static(f"\n[bold {PRIMARY}]  Current Semester[/]")
        dt_current = DataTable(id="ac-current-table", cursor_type="row")
        dt_current.add_columns("#", "Course Name", "ID", "")
        yield dt_current
        yield Static(f"\n[bold {PRIMARY}]  Previous Semesters[/]")
        dt_prev = DataTable(id="ac-prev-table", cursor_type="row")
        dt_prev.add_columns("#", "Course Name", "ID", "")
        yield dt_prev

    def populate(self, courses: list[dict]) -> None:
        current = courses[:CURRENT_SEM_COUNT]
        previous = courses[CURRENT_SEM_COUNT:]

        self.query_one("#ac-stats", Static).update(
            f"[{MUTED}]{len(courses)} total courses \u2022 "
            f"{len(current)} current semester \u2022 "
            f"{len(previous)} previous[/{MUTED}]"
        )

        ct = self.query_one("#ac-current-table", DataTable)
        ct.clear()
        for i, c in enumerate(current, 1):
            ct.add_row(str(i), c["name"], c["id"], "\u203a", key=c["id"])

        pt = self.query_one("#ac-prev-table", DataTable)
        pt.clear()
        for i, c in enumerate(previous, 1):
            pt.add_row(str(i), c["name"], c["id"], "\u203a", key=c["id"])

    def on_data_table_row_selected(self, event: DataTable.RowSelected) -> None:
        cid = str(event.row_key.value)
        table = event.data_table
        row = table.get_row(event.row_key)
        cname = row[1]
        self.post_message(self.CourseClicked(
            {"id": cid, "name": cname, "url": f"https://mydy.dypatil.edu/rait/course/view.php?id={cid}"}
        ))


# ---------------------------------------------------------------------------
# Course Detail View
# ---------------------------------------------------------------------------

class CourseDetailView(Vertical):
    """Course detail with tabs: Content, Assignments, Grades, Announcements + Download button."""

    def compose(self) -> ComposeResult:
        with Horizontal(id="course-header"):
            yield Button("\u2190 Back", id="btn-back", variant="default")
            yield Static("", id="course-title")
            yield Button("Download Materials", id="btn-dl-course", variant="warning")
        with TabbedContent(id="course-tabs"):
            with TabPane("Content", id="tab-content"):
                yield RichLog(id="content-log", highlight=True, markup=True)
            with TabPane("Assignments", id="tab-assignments"):
                dt = DataTable(id="asgn-table")
                dt.add_columns("Assignment", "Due Date", "Status", "Grading", "Grade")
                yield dt
            with TabPane("Grades", id="tab-grades"):
                dt2 = DataTable(id="grades-table")
                dt2.add_columns("Item", "Grade", "Range", "%", "Feedback")
                yield dt2
                yield Static("", id="grades-total")
            with TabPane("Announcements", id="tab-ann"):
                yield RichLog(id="ann-log", highlight=True, markup=True)

    def set_course_name(self, name: str) -> None:
        self.query_one("#course-title", Static).update(f"[bold {PRIMARY}]{name}[/]")

    def show_loading(self) -> None:
        """Clear all tabs and show loading placeholders."""
        loading_msg = f"[{MUTED}]Loading...[/{MUTED}]"
        content_log = self.query_one("#content-log", RichLog)
        content_log.clear()
        content_log.write(loading_msg)
        asgn_table = self.query_one("#asgn-table", DataTable)
        asgn_table.clear()
        grades_table = self.query_one("#grades-table", DataTable)
        grades_table.clear()
        self.query_one("#grades-total", Static).update("")
        ann_log = self.query_one("#ann-log", RichLog)
        ann_log.clear()
        ann_log.write(loading_msg)

    def populate_content(self, sections: list[dict]) -> None:
        log = self.query_one("#content-log", RichLog)
        log.clear()
        if isinstance(sections, str):
            log.write(f"[red]{sections}[/red]")
            return
        if not sections:
            log.write(f"[{MUTED}]No course content found.[/{MUTED}]")
            return
        for sec in sections:
            name = sec.get("section_name", "")
            log.write(f"\n[bold {PRIMARY}]\u2500\u2500\u2500 {name} \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500[/bold {PRIMARY}]")
            for act in sec.get("activities", []):
                atype = act.get("type", "")
                aname = act.get("name", "")
                log.write(f"  [{MUTED}][{atype}][/{MUTED}] {aname}")
            if not sec.get("activities"):
                log.write(f"  [{MUTED}](empty)[/{MUTED}]")

    def populate_assignments(self, data) -> None:
        table = self.query_one("#asgn-table", DataTable)
        table.clear()
        if isinstance(data, str):
            table.add_row(data, "--", "--", "--", "--")
            return
        if not data:
            table.add_row(f"[{MUTED}]No assignments found[/{MUTED}]", "--", "--", "--", "--")
            return
        for a in data:
            status = a.get("submission_status") or "--"
            if "submitted" in status.lower():
                status = f"[green]{status}[/green]"
            elif "no attempt" in status.lower():
                status = f"[red]{status}[/red]"
            table.add_row(
                a["name"],
                a.get("due_date") or "--",
                Text.from_markup(status),
                a.get("grading_status") or "--",
                a.get("grade") or "--",
            )

    def populate_grades(self, data) -> None:
        table = self.query_one("#grades-table", DataTable)
        table.clear()
        total_w = self.query_one("#grades-total", Static)
        if isinstance(data, str):
            total_w.update(f"[red]{data}[/red]")
            return
        if not data.get("grade_items"):
            table.add_row(f"[{MUTED}]No grades available[/{MUTED}]", "--", "--", "--", "")
            total_w.update("")
            return
        for item in data.get("grade_items", []):
            if not item.get("name"):
                continue
            table.add_row(
                item["name"], item.get("grade") or "--",
                item.get("range") or "--", item.get("percentage") or "--",
                item.get("feedback") or "",
            )
        total = data.get("course_total")
        if total and total.get("grade") and total["grade"] != "-":
            total_w.update(f"[bold]Course Total: {total['grade']} ({total.get('percentage', '')})[/bold]")
        else:
            total_w.update("")

    def populate_announcements(self, data) -> None:
        log = self.query_one("#ann-log", RichLog)
        log.clear()
        if isinstance(data, str):
            log.write(f"[{MUTED}]{data}[/{MUTED}]")
            return
        if not data:
            log.write(f"[{MUTED}]No announcements found.[/{MUTED}]")
            return
        for ann in data:
            log.write(f"\n[bold]{ann.get('title', 'Untitled')}[/bold]")
            meta = []
            if ann.get("author"):
                meta.append(ann["author"])
            if ann.get("date"):
                meta.append(ann["date"])
            if meta:
                log.write(f"  [{MUTED}]{' | '.join(meta)}[/{MUTED}]")
            if ann.get("content"):
                log.write(f"  {ann['content'][:500]}")
            log.write(f"  [{BORDER}]\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500[/{BORDER}]")


# ---------------------------------------------------------------------------
# Bulk Download View
# ---------------------------------------------------------------------------

class BulkDownloadView(VerticalScroll):
    """Multi-select courses for bulk download with progress tracking."""

    class DownloadRequested(Message):
        def __init__(self, courses: list[dict]) -> None:
            self.courses = courses
            super().__init__()

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self._selected: set[str] = set()
        self._courses: list[dict] = []

    def compose(self) -> ComposeResult:
        yield Static(f"[bold {PRIMARY}]Bulk Download[/]", id="bdl-title")
        yield Static(f"[{MUTED}]Select courses and download all materials at once[/{MUTED}]")
        yield Static("", id="bdl-selection-count")
        dt = DataTable(id="dl-table", cursor_type="row")
        dt.add_column("", key="sel")
        dt.add_column("Course Name", key="name")
        dt.add_column("ID", key="cid")
        yield dt
        with Horizontal(id="bdl-actions"):
            yield Button("Select All", id="btn-sel-all", variant="default")
            yield Button("Clear Selection", id="btn-sel-none", variant="default")
            yield Button("\u2b07 Download Selected", id="btn-bulk-dl", variant="warning")
        yield Static("", classes="spacer-sm")
        yield Static("", id="dl-status")
        yield ProgressBar(id="dl-progress", total=100, show_eta=False)
        yield RichLog(id="dl-log", highlight=True, markup=True)

    def populate(self, courses: list[dict]) -> None:
        self._courses = courses
        self._selected.clear()
        table = self.query_one("#dl-table", DataTable)
        table.clear()
        for c in courses:
            table.add_row(
                Text.from_markup(f"[{MUTED}]\u2610[/{MUTED}]"),
                c["name"], c["id"], key=c["id"],
            )
        self._update_count()

    def _update_count(self) -> None:
        n = len(self._selected)
        if n == 0:
            self.query_one("#bdl-selection-count", Static).update(
                f"[{MUTED}]No courses selected[/{MUTED}]"
            )
        else:
            self.query_one("#bdl-selection-count", Static).update(
                f"[bold {PRIMARY}]{n}[/bold {PRIMARY}] [{MUTED}]course{'s' if n != 1 else ''} selected[/{MUTED}]"
            )

    def _set_row_check(self, table: DataTable, row_key, checked: bool) -> None:
        if checked:
            table.update_cell(row_key, "sel", Text.from_markup(f"[{PRIMARY}]\u2611[/{PRIMARY}]"))
        else:
            table.update_cell(row_key, "sel", Text.from_markup(f"[{MUTED}]\u2610[/{MUTED}]"))

    def on_data_table_row_selected(self, event: DataTable.RowSelected) -> None:
        if event.data_table.id != "dl-table":
            return
        table = self.query_one("#dl-table", DataTable)
        row_key = event.row_key
        cid = str(row_key.value)
        if cid in self._selected:
            self._selected.discard(cid)
            self._set_row_check(table, row_key, False)
        else:
            self._selected.add(cid)
            self._set_row_check(table, row_key, True)
        self._update_count()

    def on_button_pressed(self, event: Button.Pressed) -> None:
        if event.button.id == "btn-bulk-dl" and self._selected:
            selected = [c for c in self._courses if c["id"] in self._selected]
            self.post_message(self.DownloadRequested(courses=selected))
        elif event.button.id == "btn-sel-all":
            table = self.query_one("#dl-table", DataTable)
            self._selected.clear()
            for c in self._courses:
                self._selected.add(c["id"])
            for rk in table.rows:
                self._set_row_check(table, rk, True)
            self._update_count()
        elif event.button.id == "btn-sel-none":
            table = self.query_one("#dl-table", DataTable)
            self._selected.clear()
            for rk in table.rows:
                self._set_row_check(table, rk, False)
            self._update_count()

    def set_status(self, msg: str) -> None:
        self.query_one("#dl-status", Static).update(msg)

    def set_progress(self, value: float) -> None:
        self.query_one("#dl-progress", ProgressBar).update(total=100, progress=value)

    def log(self, msg: str) -> None:
        self.query_one("#dl-log", RichLog).write(msg)

    def reset_log(self) -> None:
        self.query_one("#dl-log", RichLog).clear()
        self.query_one("#dl-status", Static).update("")
        self.query_one("#dl-progress", ProgressBar).update(total=100, progress=0)


# ---------------------------------------------------------------------------
# Sidebar
# ---------------------------------------------------------------------------

NAV_ITEMS = [
    ("nav-dashboard", "Dashboard"),
    ("nav-all-courses", "All Courses"),
    ("nav-bulk-dl", "Bulk Download"),
]


class Sidebar(Static):
    def compose(self) -> ComposeResult:
        yield Static(f"[bold {PRIMARY}]Menu[/]", id="sidebar-title")
        yield ListView(
            *[ListItem(Label(f"  {label}"), id=id_) for id_, label in NAV_ITEMS],
            id="nav-list",
        )


# ---------------------------------------------------------------------------
# Main App
# ---------------------------------------------------------------------------

class MydyApp(App):
    TITLE = "MyDy LMS Helper"
    SUB_TITLE = ""

    CSS = f"""
    Screen {{
        background: {BG};
    }}
    Header {{
        background: {SURFACE};
        color: {PRIMARY};
    }}
    Footer {{
        background: {SURFACE};
    }}

    /* Layout */
    #app-layout {{
        height: 1fr;
    }}
    #sidebar {{
        width: 26;
        background: {SURFACE};
        border-right: solid {BORDER};
        padding: 1 0;
    }}
    #sidebar-title {{
        padding: 0 2 1 2;
    }}
    #sidebar ListView {{
        background: {SURFACE};
    }}
    #sidebar ListItem {{
        color: {TEXT};
        padding: 1 2;
    }}
    #sidebar ListView > ListItem.-highlight {{
        background: {SURFACE_2};
        color: {PRIMARY};
    }}
    #sidebar ListView:focus > ListItem.-highlight {{
        background: {PRIMARY};
        color: {BG};
    }}
    #main {{
        width: 1fr;
        padding: 1 2;
    }}
    ContentSwitcher {{
        height: 1fr;
    }}

    /* Tables */
    DataTable {{
        height: auto;
        max-height: 24;
    }}
    .datatable--header {{
        background: {SURFACE_2};
        color: {PRIMARY};
        text-style: bold;
    }}
    .datatable--cursor {{
        background: {PRIMARY};
        color: {BG};
    }}

    /* Loading */
    #view-loading {{
        height: 1fr;
        content-align: center middle;
    }}

    /* Login - centered card */
    #view-login {{
        width: 100%;
        height: 100%;
    }}
    #login-card {{
        width: 56;
        height: auto;
        background: {SURFACE};
        border: round {BORDER};
        padding: 2 4;
    }}
    #login-title {{
        text-align: center;
        width: 100%;
        text-style: bold;
        margin: 0 0 1 0;
    }}
    #login-subtitle {{
        text-align: center;
        width: 100%;
        margin: 0 0 1 0;
    }}
    #login-error {{
        text-align: center;
        width: 100%;
        height: auto;
        margin: 1 0;
    }}
    #login-card Input {{
        width: 100%;
        margin: 1 0 0 0;
    }}
    #btn-login {{
        width: 100%;
        margin: 1 0 0 0;
        background: {PRIMARY};
        color: {BG};
    }}
    .spacer-sm {{
        height: 1;
    }}

    /* Dashboard */
    #dash-welcome {{
        text-style: bold;
        margin: 0 0 0 0;
    }}
    #dash-semester {{
        margin: 0 0 1 0;
    }}
    #stat-cards {{
        height: auto;
        margin: 1 0;
    }}
    #stat-cards > Static {{
        width: 1fr;
        height: auto;
        background: {SURFACE};
        border: round {BORDER};
        padding: 1 2;
        margin: 0 1 0 0;
        text-align: center;
    }}
    #att-section-title {{
        margin: 1 0 0 0;
    }}
    #att-bars {{
        height: auto;
        max-height: 12;
        margin: 0 0 1 0;
    }}

    /* Course detail */
    #course-header {{
        height: 3;
        padding: 0 1;
        background: {SURFACE};
        align: center middle;
    }}
    #course-title {{
        width: 1fr;
        padding: 0 2;
    }}
    #btn-back {{
        width: auto;
        min-width: 10;
    }}
    #btn-dl-course {{
        width: auto;
        background: {PRIMARY};
        color: {BG};
    }}

    /* Tabs */
    TabbedContent {{
        height: 1fr;
    }}
    Underline > .underline--bar {{
        color: {MUTED};
    }}
    Underline > .underline--bar .underline--highlight {{
        color: {PRIMARY};
    }}
    Tab {{
        color: {MUTED};
    }}
    Tab.-active {{
        color: {PRIMARY};
        text-style: bold;
    }}
    TabPane {{
        padding: 1;
    }}
    RichLog {{
        height: 1fr;
    }}

    /* All Courses */
    #ac-title {{
        margin: 0 0 0 0;
    }}
    #ac-stats {{
        margin: 0 0 1 0;
    }}
    #ac-current-table {{
        max-height: 14;
    }}
    #ac-prev-table {{
        max-height: 30;
    }}

    /* Bulk download */
    #bdl-title {{
        margin: 0 0 0 0;
    }}
    #bdl-selection-count {{
        margin: 1 0;
    }}
    #bdl-actions {{
        height: auto;
        margin: 1 0;
    }}
    #btn-sel-all, #btn-sel-none {{
        width: auto;
        margin: 0 1 0 0;
    }}
    #btn-bulk-dl {{
        margin: 0 0 0 1;
        background: {PRIMARY};
        color: {BG};
    }}
    ProgressBar {{
        padding: 1 0;
    }}
    ProgressBar Bar > .bar--bar {{
        color: {PRIMARY};
    }}
    ProgressBar Bar > .bar--complete {{
        color: {PRIMARY};
    }}
    Button {{
        margin: 0 1;
    }}
    #view-error {{
        padding: 2;
        color: red;
    }}
    """

    BINDINGS = [
        Binding("q", "quit", "Quit"),
    ]

    def __init__(self):
        super().__init__()
        self.client = MydyClient()
        self._courses: list[dict] = []
        self._current_course: dict | None = None
        self._previous_view: str = "view-dashboard"

    def compose(self) -> ComposeResult:
        yield Header()
        with Horizontal(id="app-layout"):
            with Vertical(id="sidebar"):
                yield Sidebar()
            with Vertical(id="main"):
                with ContentSwitcher(id="content", initial="view-loading"):
                    yield LoadingIndicator(id="view-loading")
                    yield LoginView(id="view-login")
                    yield DashboardView(id="view-dashboard")
                    yield AllCoursesView(id="view-all-courses")
                    yield CourseDetailView(id="view-course")
                    yield BulkDownloadView(id="view-bulk-dl")
                    yield Static("", id="view-error")
        yield Footer()

    def on_mount(self) -> None:
        username = os.getenv("MYDY_USERNAME", "")
        password = os.getenv("MYDY_PASSWORD", "")
        if username and password:
            self._do_login(username, password)
        else:
            self.query_one("#content", ContentSwitcher).current = "view-login"

    # -- login -------------------------------------------------------------

    def on_login_view_logged_in(self, event: LoginView.LoggedIn) -> None:
        self._do_login(event.result["username"], event.result["password"])

    @work(thread=True, exclusive=True, group="login")
    def _do_login(self, username: str, password: str) -> None:
        result = self.client.login(username, password)
        if result["success"]:
            self.call_from_thread(self._on_login_success, result)
        else:
            self.call_from_thread(self._on_login_failure, result)

    def _on_login_success(self, result: dict) -> None:
        self.sub_title = result["message"]
        self._load_dashboard()

    def _on_login_failure(self, result: dict) -> None:
        self.sub_title = "Login Failed"
        cs = self.query_one("#content", ContentSwitcher)
        cs.current = "view-login"
        self.query_one("#view-login", LoginView).show_error(result["message"])

    # -- dashboard ---------------------------------------------------------

    def _load_dashboard(self) -> None:
        self._show_loading()
        self._load_dashboard_worker()

    @work(thread=True, exclusive=True, group="fetch")
    def _load_dashboard_worker(self) -> None:
        courses = self.client.list_courses()
        attendance = self.client.get_attendance()
        self.call_from_thread(self._display_dashboard, courses, attendance)

    def _display_dashboard(self, courses, attendance) -> None:
        if isinstance(courses, str):
            self._show_error(courses)
            return
        self._courses = courses
        view = self.query_one("#view-dashboard", DashboardView)
        view.populate(attendance, courses)
        self.query_one("#content", ContentSwitcher).current = "view-dashboard"

    # -- course detail -----------------------------------------------------

    def _open_course(self, course: dict) -> None:
        self._current_course = course
        cs = self.query_one("#content", ContentSwitcher)
        self._previous_view = cs.current or "view-dashboard"
        view = self.query_one("#view-course", CourseDetailView)
        view.set_course_name(course["name"])
        view.show_loading()
        cs.current = "view-course"
        self._load_course_data(course["id"])

    @work(thread=True, exclusive=True, group="fetch")
    def _load_course_data(self, course_id: str) -> None:
        content = self.client.get_course_content(course_id)
        self.call_from_thread(self._populate_tab, "content", content)

        assignments = self.client.get_assignments(course_id)
        self.call_from_thread(self._populate_tab, "assignments", assignments)

        grades = self.client.get_grades(course_id)
        self.call_from_thread(self._populate_tab, "grades", grades)

        announcements = self.client.get_announcements(course_id)
        self.call_from_thread(self._populate_tab, "announcements", announcements)

    def _populate_tab(self, tab: str, data) -> None:
        view = self.query_one("#view-course", CourseDetailView)
        if tab == "content":
            view.populate_content(data)
        elif tab == "assignments":
            view.populate_assignments(data)
        elif tab == "grades":
            view.populate_grades(data)
        elif tab == "announcements":
            view.populate_announcements(data)

    # -- navigation --------------------------------------------------------

    def on_list_view_selected(self, event: ListView.Selected) -> None:
        item_id = event.item.id
        if not item_id:
            return

        cs = self.query_one("#content", ContentSwitcher)

        if item_id == "nav-dashboard":
            if self._courses:
                cs.current = "view-dashboard"
            else:
                self._load_dashboard()

        elif item_id == "nav-all-courses":
            if self._courses:
                view = self.query_one("#view-all-courses", AllCoursesView)
                view.populate(self._courses)
                cs.current = "view-all-courses"
            else:
                self._show_error("No courses loaded yet.")

        elif item_id == "nav-bulk-dl":
            if self._courses:
                view = self.query_one("#view-bulk-dl", BulkDownloadView)
                view.populate(self._courses)
                cs.current = "view-bulk-dl"
            else:
                self._show_error("No courses loaded yet.")

    def on_dashboard_view_course_clicked(self, event: DashboardView.CourseClicked) -> None:
        self._open_course(event.course)

    def on_all_courses_view_course_clicked(self, event: AllCoursesView.CourseClicked) -> None:
        self._open_course(event.course)

    def on_button_pressed(self, event: Button.Pressed) -> None:
        if event.button.id == "btn-back":
            cs = self.query_one("#content", ContentSwitcher)
            cs.current = self._previous_view

        elif event.button.id == "btn-dl-course" and self._current_course:
            self._do_single_download(self._current_course)

    # -- downloads ---------------------------------------------------------

    def on_bulk_download_view_download_requested(self, event: BulkDownloadView.DownloadRequested) -> None:
        self._do_bulk_download(event.courses)

    @work(thread=True, exclusive=True, group="download")
    def _do_single_download(self, course: dict) -> None:
        self.call_from_thread(self._switch_to_bulk_dl_view)
        dl_view = "view-bulk-dl"

        def _status(msg):
            self.call_from_thread(self._dl_set_status, msg)

        def _log(msg):
            self.call_from_thread(self._dl_log, msg)

        _status(f"[bold]Downloading: {course['name']}...[/bold]")

        def progress_cb(event_type, data):
            if event_type == "activity":
                pct = (data["index"] / data["total"]) * 100 if data["total"] else 0
                self.call_from_thread(self._dl_set_progress, pct)
            elif event_type == "file_done":
                fn = data.get("filename", "?")
                st = data.get("status", "")
                if st == "skipped":
                    _log(f"  [{MUTED}]Skipped: {fn}[/{MUTED}]")
                elif st == "error":
                    _log(f"  [red]Error: {fn} \u2014 {data.get('error', '')}[/red]")
                else:
                    sz = data.get("size_bytes", 0)
                    mb = sz / (1024 * 1024)
                    _log(f"  [green]Downloaded:[/green] {fn} ({mb:.1f} MB)")

        result = self.client.download_course_materials(course, progress_callback=progress_cb)
        self.call_from_thread(self._dl_set_progress, 100)
        _status(
            f"[bold green]Done![/bold green] {result.get('downloaded', 0)} files downloaded, "
            f"{result.get('failed', 0)} failed."
        )

    @work(thread=True, exclusive=True, group="download")
    def _do_bulk_download(self, courses: list[dict]) -> None:
        self.call_from_thread(self._dl_reset)

        total_files = 0
        total_failed = 0

        for idx, course in enumerate(courses):
            self.call_from_thread(
                self._dl_set_status,
                f"[bold]Downloading {idx + 1}/{len(courses)}: {course['name']}...[/bold]",
            )

            def progress_cb(event_type, data):
                if event_type == "activity":
                    pct = (data["index"] / data["total"]) * 100 if data["total"] else 0
                    self.call_from_thread(self._dl_set_progress, pct)
                elif event_type == "file_done":
                    fn = data.get("filename", "?")
                    st = data.get("status", "")
                    if st == "skipped":
                        self.call_from_thread(self._dl_log, f"  [{MUTED}]Skipped: {fn}[/{MUTED}]")
                    elif st == "error":
                        self.call_from_thread(self._dl_log, f"  [red]Error: {fn}[/red]")
                    else:
                        sz = data.get("size_bytes", 0)
                        mb = sz / (1024 * 1024)
                        self.call_from_thread(self._dl_log, f"  [green]Downloaded:[/green] {fn} ({mb:.1f} MB)")

            result = self.client.download_course_materials(course, progress_callback=progress_cb)
            total_files += result.get("downloaded", 0)
            total_failed += result.get("failed", 0)
            self.call_from_thread(
                self._dl_log,
                f"[bold {PRIMARY}]{course['name']}: {result.get('downloaded', 0)} files, "
                f"{result.get('failed', 0)} failed[/bold {PRIMARY}]",
            )

        self.call_from_thread(self._dl_set_progress, 100)
        self.call_from_thread(
            self._dl_set_status,
            f"[bold green]Done![/bold green] {total_files} files, {total_failed} failed "
            f"across {len(courses)} courses.",
        )

    def _switch_to_bulk_dl_view(self) -> None:
        self.query_one("#content", ContentSwitcher).current = "view-bulk-dl"

    def _dl_reset(self) -> None:
        self.query_one("#view-bulk-dl", BulkDownloadView).reset_log()

    def _dl_set_status(self, msg: str) -> None:
        self.query_one("#view-bulk-dl", BulkDownloadView).set_status(msg)

    def _dl_set_progress(self, value: float) -> None:
        self.query_one("#view-bulk-dl", BulkDownloadView).set_progress(value)

    def _dl_log(self, msg: str) -> None:
        self.query_one("#view-bulk-dl", BulkDownloadView).log(msg)

    # -- helpers -----------------------------------------------------------

    def _show_loading(self) -> None:
        self.query_one("#content", ContentSwitcher).current = "view-loading"

    def _show_error(self, msg: str) -> None:
        err = self.query_one("#view-error", Static)
        err.update(f"[red]{msg}[/red]")
        self.query_one("#content", ContentSwitcher).current = "view-error"
