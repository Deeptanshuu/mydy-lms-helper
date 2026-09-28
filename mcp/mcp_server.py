"""
MyDy LMS Helper - MCP Server

An MCP (Model Context Protocol) server that exposes tools for interacting with
the MyDy (Moodle-based) Learning Management System at D.Y. Patil institutions.

Tools:
  - login: Authenticate with the LMS
  - list_courses: Get available courses from the dashboard
  - download_course_materials: Download all materials from specified courses
  - get_course_content: List all sections and activities in a course
  - get_assignments: View assignments with due dates and submission status
  - get_grades: Fetch grade report for a course
  - get_announcements: Read course announcements/forum posts
  - get_attendance: View attendance summary across all subjects

Usage with Claude Code:
  claude mcp add mydy-lms -- python /path/to/mcp_server.py

Usage with claude_desktop_config.json:
  {
    "mcpServers": {
      "mydy-lms": {
        "command": "python",
        "args": ["/path/to/mcp_server.py"],
        "env": {
          "MYDY_USERNAME": "your_username",
          "MYDY_PASSWORD": "your_password"
        }
      }
    }
  }
"""

import os
import re
import time
import random
from urllib.parse import unquote

import requests
from bs4 import BeautifulSoup
from mcp.server.fastmcp import FastMCP

# Create MCP server
mcp = FastMCP(
    "mydy-lms",
    instructions="Tools for interacting with the MyDy (Moodle) LMS - login, list courses, download materials, view course content, assignments, grades, announcements, and attendance.",
)

# Global session state
_session: requests.Session | None = None
_logged_in: bool = False

# Rate limiting settings
MIN_DELAY = 0.5
MAX_DELAY = 0.5
DOWNLOAD_DELAY = 0.1


def _rate_limit(operation_type: str = "general") -> None:
    """Apply rate limiting to avoid overwhelming the server."""
    if operation_type == "download":
        delay = random.uniform(MIN_DELAY + DOWNLOAD_DELAY, MAX_DELAY + DOWNLOAD_DELAY)
    else:
        delay = random.uniform(MIN_DELAY, MAX_DELAY)
    time.sleep(delay)


def _get_session() -> requests.Session:
    """Get or create the requests session."""
    global _session
    if _session is None:
        _session = requests.Session()
    return _session


def _sanitize_folder_name(name: str) -> str:
    """Sanitize course name for folder creation."""
    return re.sub(r'[<>:"/\\|?*]', '_', name).strip()


def _extract_course_name(soup: BeautifulSoup) -> str:
    """Extract course name from page title."""
    title_tag = soup.find('title')
    if title_tag:
        title_text = title_tag.get_text()
        if "Course:" in title_text:
            return title_text.split("Course:", 1)[1].strip()
        return title_text.strip()
    return "Unknown Course"


def _fetch_course_page(session: requests.Session, course_id: str) -> tuple[BeautifulSoup, str] | str:
    """Fetch and parse a course page. Returns (soup, course_name) or error string."""
    _rate_limit("course")
    url = f"https://mydy.dypatil.edu/rait/course/view.php?id={course_id}"
    try:
        resp = session.get(url)
        if resp.status_code != 200:
            return f"Error: Course page returned status {resp.status_code}"
        if 'login' in resp.url and 'course' not in resp.url:
            return "Error: Session expired. Please login again."
        soup = BeautifulSoup(resp.text, 'html.parser')
        course_name = _extract_course_name(soup)
        return (soup, course_name)
    except requests.RequestException as e:
        return f"Network error fetching course: {str(e)}"


def _get_activity_name(element) -> str:
    """Extract clean activity name from a Moodle activity element."""
    name_span = element.find('span', class_='instancename')
    if name_span:
        # Remove accesshide spans (screen-reader-only text)
        for hidden in name_span.find_all('span', class_='accesshide'):
            hidden.decompose()
        return name_span.get_text(strip=True)
    a_tag = element.find('a', href=True)
    if a_tag:
        return a_tag.get_text(strip=True)
    return ""


def _download_file(
    session: requests.Session,
    url: str,
    folder: str,
    source_type: str,
) -> dict | None:
    """Download a single file. Returns file info dict or None on failure."""
    try:
        _rate_limit("download")
        download_start = time.time()
        file_resp = session.get(url, stream=True)

        if file_resp.status_code != 200:
            return None

        filename = unquote(url.split('/')[-1])
        # Strip query params from filename
        if '?' in filename:
            filename = filename.split('?')[0]
        filepath = os.path.join(folder, filename)

        total_size = int(file_resp.headers.get('content-length', 0))

        # Skip if file already exists with same size
        if os.path.exists(filepath) and total_size > 0:
            if os.path.getsize(filepath) == total_size:
                return {
                    "filename": filename,
                    "size_bytes": total_size,
                    "status": "skipped_exists",
                    "source": source_type,
                }

        # Download file
        downloaded = 0
        with open(filepath, 'wb') as f:
            for chunk in file_resp.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)
                    downloaded += len(chunk)

        download_time = time.time() - download_start
        return {
            "filename": filename,
            "size_bytes": downloaded,
            "download_time_seconds": round(download_time, 2),
            "status": "downloaded",
            "source": source_type,
            "path": filepath,
        }
    except Exception as e:
        return {"filename": url.split('/')[-1], "status": "error", "error": str(e)}


def _try_download_methods(
    session: requests.Session,
    activity_url: str,
    folder: str,
) -> dict | None:
    """Try all download methods for an activity. Returns file info or None."""
    _rate_limit("activity")
    activity_resp = session.get(activity_url)
    soup = BeautifulSoup(activity_resp.text, 'html.parser')

    # Method 1: Direct file links
    for a in soup.find_all('a', href=True):
        href = a['href']
        if 'pluginfile.php' in href or href.endswith(('.pdf', '.ppt', '.pptx', '.docx')):
            file_url = href if href.startswith('http') else 'https://mydy.dypatil.edu' + href
            result = _download_file(session, file_url, folder, "direct")
            if result:
                return result

    # Method 2: FlexPaper PDFs
    pdf_links = re.findall(r"PDFFile\s*:\s*'([^']+)'", activity_resp.text)
    for pdf_url in pdf_links:
        result = _download_file(session, pdf_url, folder, "flexpaper")
        if result:
            return result

    # Method 3: Presentation files
    for a in soup.find_all('a', href=True):
        href = a['href']
        if href.endswith(('.ppt', '.pptx')):
            file_url = href if href.startswith('http') else 'https://mydy.dypatil.edu' + href
            result = _download_file(session, file_url, folder, "presentation")
            if result:
                return result

    # Method 4: Iframe sources
    iframe = soup.find('iframe', id='presentationobject')
    if iframe and iframe.has_attr('src'):
        result = _download_file(session, iframe['src'], folder, "iframe")
        if result:
            return result

    # Method 5: Object data
    obj = soup.find('object', id='presentationobject')
    if obj and obj.has_attr('data'):
        result = _download_file(session, obj['data'], folder, "object")
        if result:
            return result

    return None


@mcp.tool()
def login(username: str = "", password: str = "") -> str:
    """
    Authenticate with the MyDy LMS portal.

    If username/password are not provided, falls back to MYDY_USERNAME and
    MYDY_PASSWORD environment variables.

    Args:
        username: LMS username (optional, uses MYDY_USERNAME env var if empty)
        password: LMS password (optional, uses MYDY_PASSWORD env var if empty)

    Returns:
        Login status message.
    """
    global _logged_in

    session = _get_session()
    username = username or os.getenv('MYDY_USERNAME', '')
    password = password or os.getenv('MYDY_PASSWORD', '')

    if not username or not password:
        return "Error: No credentials provided. Pass username/password or set MYDY_USERNAME and MYDY_PASSWORD environment variables."

    try:
        # Step 1: Access the university portal
        initial_url = 'https://mydy.dypatil.edu/rait/login/index.php'
        initial_resp = session.get(initial_url)

        if initial_resp.url == 'https://mydy.dypatil.edu/':
            # Custom username entry page - submit username first
            step1_payload = {
                'username': username,
                'wantsurl': '',
                'next': 'Next'
            }
            step1_resp = session.post('https://mydy.dypatil.edu/index.php', data=step1_payload)

            if 'rait/login/index.php' in step1_resp.url and 'uname=' in step1_resp.url:
                moodle_login_resp = session.get(step1_resp.url)
                login_soup = BeautifulSoup(moodle_login_resp.text, 'html.parser')
            else:
                # Try direct access
                direct_url = f"https://mydy.dypatil.edu/rait/login/index.php?uname={username}&wantsurl="
                moodle_login_resp = session.get(direct_url)
                login_soup = BeautifulSoup(moodle_login_resp.text, 'html.parser')
        else:
            login_soup = BeautifulSoup(initial_resp.text, 'html.parser')

        # Find password field and submit login
        password_field = login_soup.find('input', {'name': 'password'})
        if not password_field:
            _logged_in = False
            return "Error: Could not find password field on login page. The LMS portal may be down or has changed."

        # Collect hidden fields
        login_payload = {}
        for inp in login_soup.find_all('input', {'type': 'hidden'}):
            name = inp.get('name')
            value = inp.get('value', '')
            if name:
                login_payload[name] = value

        login_payload['password'] = password

        # Find form action URL
        form = login_soup.find('form')
        if form and form.get('action'):
            login_action_url = form['action']
            if not login_action_url.startswith('http'):
                login_action_url = 'https://mydy.dypatil.edu/rait/login/' + login_action_url.lstrip('/')
        else:
            login_action_url = 'https://mydy.dypatil.edu/rait/login/index.php'

        login_resp = session.post(login_action_url, data=login_payload)

        # Check login success
        resp_text = login_resp.text.lower()
        has_login_form = (
            BeautifulSoup(login_resp.text, 'html.parser').find('input', {'name': 'password'}) is not None
            or 'notloggedin' in resp_text
        )
        has_error = any(x in resp_text for x in ['invalid login', 'login failed', 'incorrect username', 'incorrect password'])
        has_success = any(x in resp_text for x in ['dashboard', 'my home', 'logout', 'profile'])

        if has_login_form or has_error:
            _logged_in = False
            return "Login failed. Please check your credentials."

        if has_success:
            _logged_in = True
            masked_user = username[:2] + "****" + username[-2:] if len(username) > 4 else "****"
            return f"Successfully logged in as {masked_user}."

        # Ambiguous - check URL
        if 'rait' in login_resp.url and 'login' not in login_resp.url:
            _logged_in = True
            return "Login appears successful (redirected to dashboard)."

        _logged_in = False
        return "Login result unclear. You may need to try again."

    except requests.RequestException as e:
        _logged_in = False
        return f"Network error during login: {str(e)}"


@mcp.tool()
def list_courses() -> list[dict] | str:
    """
    List all available courses from the LMS dashboard.

    Must be logged in first (call login tool).

    Returns:
        List of courses with id, name, and url fields, or an error message.
    """
    if not _logged_in:
        return "Error: Not logged in. Call the login tool first."

    session = _get_session()

    try:
        _rate_limit("dashboard")
        dashboard_resp = session.get("https://mydy.dypatil.edu/rait/my/")

        if dashboard_resp.status_code != 200:
            return f"Error: Dashboard returned status {dashboard_resp.status_code}"

        soup = BeautifulSoup(dashboard_resp.text, 'html.parser')
        courses = []
        seen_ids: set[str] = set()

        # Method 1: Previous semester classes block
        prev_block = soup.find('div', {'id': re.compile(r'.*stu_previousclasses.*')})
        if prev_block:
            for link in prev_block.find_all('a', href=re.compile(r'/course/view\.php\?id=\d+')):
                href = link.get('href', '')
                match = re.search(r'id=(\d+)', href)
                if match:
                    cid = match.group(1)
                    if cid not in seen_ids:
                        seen_ids.add(cid)
                        full_url = href if href.startswith('http') else 'https://mydy.dypatil.edu' + href
                        courses.append({"id": cid, "name": link.get_text(strip=True), "url": full_url})

        # Method 2: Navigation blocks
        for block in soup.find_all('div', class_=re.compile(r'block.*navigation|block.*tree|block.*university')):
            for link in block.find_all('a', href=re.compile(r'/course/view\.php\?id=\d+')):
                href = link.get('href', '')
                match = re.search(r'id=(\d+)', href)
                if match:
                    cid = match.group(1)
                    if cid not in seen_ids:
                        seen_ids.add(cid)
                        full_url = href if href.startswith('http') else 'https://mydy.dypatil.edu' + href
                        courses.append({"id": cid, "name": link.get_text(strip=True), "url": full_url})

        # Method 3: Fallback - scan entire page
        if not courses:
            for link in soup.find_all('a', href=re.compile(r'/course/view\.php\?id=\d+')):
                href = link.get('href', '')
                match = re.search(r'id=(\d+)', href)
                if match:
                    cid = match.group(1)
                    if cid not in seen_ids:
                        name = link.get_text(strip=True)
                        if name and len(name.strip()) > 2:
                            seen_ids.add(cid)
                            full_url = href if href.startswith('http') else 'https://mydy.dypatil.edu' + href
                            courses.append({"id": cid, "name": name, "url": full_url})

        courses.sort(key=lambda x: int(x['id']), reverse=True)

        if not courses:
            return "No courses found. This might be normal between semesters."

        return courses

    except requests.RequestException as e:
        return f"Network error: {str(e)}"


@mcp.tool()
def download_course_materials(
    course_ids: list[str] | None = None,
    download_dir: str = ".",
) -> dict:
    """
    Download all materials from specified courses.

    Must be logged in first (call login tool). Use list_courses to see available
    course IDs.

    Args:
        course_ids: List of course IDs to download. If None/empty, downloads all courses.
        download_dir: Directory to save files into. Defaults to current directory.
            Each course gets its own subfolder.

    Returns:
        Download summary with per-course results.
    """
    if not _logged_in:
        return {"error": "Not logged in. Call the login tool first."}

    session = _get_session()

    # Get course list
    courses_result = list_courses()
    if isinstance(courses_result, str):
        return {"error": courses_result}

    all_courses: list[dict] = courses_result

    # Filter to requested courses
    if course_ids:
        id_set = set(course_ids)
        selected = [c for c in all_courses if c['id'] in id_set]
        missing = id_set - {c['id'] for c in selected}
        if missing:
            return {"error": f"Course IDs not found: {', '.join(missing)}. Use list_courses to see available IDs."}
    else:
        selected = all_courses

    if not selected:
        return {"error": "No courses to download."}

    results = []
    download_start = time.time()

    for course in selected:
        course_result = _download_single_course(session, course, download_dir)
        results.append(course_result)

    total_time = time.time() - download_start
    total_files = sum(r['downloaded'] for r in results)
    total_failed = sum(r['failed'] for r in results)

    return {
        "summary": {
            "courses_processed": len(results),
            "total_files_downloaded": total_files,
            "total_failed_activities": total_failed,
            "total_time_seconds": round(total_time, 2),
        },
        "courses": results,
    }


def _download_single_course(
    session: requests.Session,
    course: dict,
    base_dir: str,
) -> dict:
    """Download all materials from a single course."""
    _rate_limit("course")

    try:
        resp = session.get(course['url'])
        soup = BeautifulSoup(resp.text, 'html.parser')
    except requests.RequestException as e:
        return {
            "course_id": course['id'],
            "course_name": course['name'],
            "downloaded": 0,
            "failed": 0,
            "error": str(e),
            "files": [],
        }

    course_name = _extract_course_name(soup)
    folder_name = _sanitize_folder_name(course_name)
    course_folder = os.path.join(base_dir, folder_name)

    os.makedirs(course_folder, exist_ok=True)

    # Find activity links
    activity_types = [
        '/mod/resource/view.php',
        '/mod/flexpaper/view.php',
        '/mod/presentation/view.php',
        '/mod/casestudy/view.php',
        '/mod/dyquestion/view.php',
    ]
    activity_links = []

    for li in soup.find_all('li', class_=re.compile(r'\bactivity\b')):
        a = li.find('a', href=True)
        if a:
            href = a['href']
            if any(x in href for x in activity_types):
                full_url = href if href.startswith('http') else 'https://mydy.dypatil.edu' + href
                activity_links.append(full_url)

    downloaded_files = []
    failed_activities = []

    for activity_url in activity_links:
        result = _try_download_methods(session, activity_url, course_folder)
        if result:
            downloaded_files.append(result)
        else:
            failed_activities.append(activity_url)

    return {
        "course_id": course['id'],
        "course_name": course_name,
        "folder": course_folder,
        "activities_found": len(activity_links),
        "downloaded": len(downloaded_files),
        "failed": len(failed_activities),
        "files": downloaded_files,
    }


@mcp.tool()
def get_course_content(course_id: str) -> list[dict] | str:
    """
    List all sections and activities in a course.

    Must be logged in first (call login tool).

    Args:
        course_id: The course ID (from list_courses).

    Returns:
        List of sections, each with section_number, section_name, and activities list.
    """
    if not _logged_in:
        return "Error: Not logged in. Call the login tool first."

    session = _get_session()
    result = _fetch_course_page(session, course_id)
    if isinstance(result, str):
        return result
    soup, course_name = result

    sections = []

    # Find section elements
    section_elements = soup.find_all('li', class_=re.compile(r'\bsection\b'))
    if not section_elements:
        section_elements = soup.find_all('div', class_=re.compile(r'\bsection\b'))

    for section_el in section_elements:
        # Extract section number from id="section-N"
        section_id = section_el.get('id', '')
        match = re.search(r'section-(\d+)', section_id)
        section_num = int(match.group(1)) if match else None

        # Extract section name
        name_el = section_el.find(class_='sectionname') or section_el.find(['h3', 'h4'])
        section_name = name_el.get_text(strip=True) if name_el else f"Section {section_num}"

        # Find activities within this section
        activities = []
        for activity_li in section_el.find_all('li', class_=re.compile(r'\bactivity\b')):
            classes = ' '.join(activity_li.get('class', []))
            type_match = re.search(r'modtype_(\w+)', classes)
            activity_type = type_match.group(1) if type_match else "unknown"

            activity_name = _get_activity_name(activity_li)
            a_tag = activity_li.find('a', href=True)
            if not a_tag:
                continue
            href = a_tag['href']
            full_url = href if href.startswith('http') else 'https://mydy.dypatil.edu' + href

            activities.append({
                "name": activity_name,
                "type": activity_type,
                "url": full_url,
            })

        sections.append({
            "section_number": section_num,
            "section_name": section_name,
            "activities": activities,
        })

    # Fallback: if no sections found, list all activities flat
    if not sections:
        all_activities = []
        for activity_li in soup.find_all('li', class_=re.compile(r'\bactivity\b')):
            classes = ' '.join(activity_li.get('class', []))
            type_match = re.search(r'modtype_(\w+)', classes)
            activity_type = type_match.group(1) if type_match else "unknown"

            activity_name = _get_activity_name(activity_li)
            a_tag = activity_li.find('a', href=True)
            if not a_tag:
                continue
            href = a_tag['href']
            full_url = href if href.startswith('http') else 'https://mydy.dypatil.edu' + href

            all_activities.append({"name": activity_name, "type": activity_type, "url": full_url})

        if all_activities:
            sections = [{"section_number": 0, "section_name": "All Activities", "activities": all_activities}]

    return sections


@mcp.tool()
def get_assignments(course_id: str) -> list[dict] | str:
    """
    View assignments with due dates and submission status for a course.

    Must be logged in first (call login tool).

    Args:
        course_id: The course ID (from list_courses).

    Returns:
        List of assignments with name, url, due_date, submission_status, grading_status, grade, and time_remaining.
    """
    if not _logged_in:
        return "Error: Not logged in. Call the login tool first."

    session = _get_session()
    result = _fetch_course_page(session, course_id)
    if isinstance(result, str):
        return result
    soup, course_name = result

    # Find assignment links
    assignment_links = []

    # Method 1: activity elements with modtype_assign
    for li in soup.find_all('li', class_=re.compile(r'modtype_assign')):
        a = li.find('a', href=True)
        if a and '/mod/assign/view.php' in a['href']:
            name = _get_activity_name(li)
            href = a['href']
            url = href if href.startswith('http') else 'https://mydy.dypatil.edu' + href
            assignment_links.append({"name": name, "url": url})

    # Method 2: fallback scan all links
    if not assignment_links:
        seen: set[str] = set()
        for a in soup.find_all('a', href=re.compile(r'/mod/assign/view\.php\?id=\d+')):
            href = a['href']
            if href not in seen:
                seen.add(href)
                url = href if href.startswith('http') else 'https://mydy.dypatil.edu' + href
                assignment_links.append({"name": a.get_text(strip=True), "url": url})

    if not assignment_links:
        return []

    assignments = []
    for asgn in assignment_links:
        _rate_limit("activity")
        try:
            resp = session.get(asgn["url"])
            asoup = BeautifulSoup(resp.text, 'html.parser')

            info: dict = {"name": asgn["name"], "url": asgn["url"]}

            # Parse submission status table
            table = asoup.find('table', class_='submissionstatustable') or asoup.find('table', class_='generaltable')
            if table:
                for row in table.find_all('tr'):
                    cells = row.find_all(['td', 'th'])
                    if len(cells) >= 2:
                        label = cells[0].get_text(strip=True).lower()
                        value = cells[1].get_text(strip=True)
                        if 'due date' in label:
                            info['due_date'] = value
                        elif 'submission status' in label:
                            info['submission_status'] = value
                        elif 'grading status' in label:
                            info['grading_status'] = value
                        elif 'grade' in label and 'grading' not in label:
                            info['grade'] = value
                        elif 'time remaining' in label:
                            info['time_remaining'] = value

            for field in ['due_date', 'submission_status', 'grading_status', 'grade', 'time_remaining']:
                info.setdefault(field, None)

            assignments.append(info)
        except requests.RequestException as e:
            assignments.append({
                "name": asgn["name"], "url": asgn["url"],
                "error": str(e),
                "due_date": None, "submission_status": None,
                "grading_status": None, "grade": None, "time_remaining": None,
            })

    return assignments


@mcp.tool()
def get_grades(course_id: str) -> dict | str:
    """
    Fetch the grade report for a course.

    Must be logged in first (call login tool).

    Args:
        course_id: The course ID (from list_courses).

    Returns:
        Dict with course_name, grade_items list, and course_total.
    """
    if not _logged_in:
        return "Error: Not logged in. Call the login tool first."

    session = _get_session()
    _rate_limit("course")
    url = f"https://mydy.dypatil.edu/rait/grade/report/user/index.php?id={course_id}"

    try:
        resp = session.get(url)
        if resp.status_code != 200:
            return f"Error: Grade page returned status {resp.status_code}"
    except requests.RequestException as e:
        return f"Network error: {str(e)}"

    soup = BeautifulSoup(resp.text, 'html.parser')
    course_name = _extract_course_name(soup)

    # Check for access errors
    error_div = soup.find('div', class_='errorbox') or soup.find('div', class_=re.compile(r'alert-danger'))
    if error_div:
        return f"Error accessing grades: {error_div.get_text(strip=True)}"

    # Find grade table
    table = (
        soup.find('table', class_=re.compile(r'user-grade'))
        or soup.find('table', id='user-grade')
        or soup.find('table', class_='generaltable')
    )

    if not table:
        return {"course_name": course_name, "grade_items": [], "course_total": None}

    # Detect column indices from header
    headers: list[str] = []
    header_row = table.find('tr')
    if header_row:
        for th in header_row.find_all(['th', 'td']):
            headers.append(th.get_text(strip=True).lower())

    col_map: dict[str, int] = {}
    for i, h in enumerate(headers):
        if 'grade item' in h or ('item' in h and 'grade' not in col_map):
            col_map['name'] = i
        elif h == 'grade' or ('grade' in h and 'item' not in h and 'grade' not in col_map):
            col_map['grade'] = i
        elif 'range' in h:
            col_map['range'] = i
        elif 'percentage' in h:
            col_map['percentage'] = i
        elif 'feedback' in h:
            col_map['feedback'] = i

    # Parse data rows
    grade_items = []
    course_total = None
    rows = table.find_all('tr')[1:]  # skip header

    for row in rows:
        cells = row.find_all(['td', 'th'])
        if not cells:
            continue

        def _cell_text(col_key: str) -> str | None:
            idx = col_map.get(col_key)
            if idx is not None and idx < len(cells):
                return cells[idx].get_text(strip=True)
            return None

        item = {
            "name": _cell_text('name') or cells[0].get_text(strip=True),
            "grade": _cell_text('grade'),
            "range": _cell_text('range'),
            "percentage": _cell_text('percentage'),
            "feedback": _cell_text('feedback'),
        }

        if 'course total' in (item['name'] or '').lower():
            course_total = {k: v for k, v in item.items() if k != 'name'}
        else:
            # Skip empty category rows
            row_classes = ' '.join(row.get('class', []))
            if 'category' in row_classes and not item.get('grade'):
                continue
            grade_items.append(item)

    return {
        "course_name": course_name,
        "grade_items": grade_items,
        "course_total": course_total,
    }


@mcp.tool()
def get_announcements(course_id: str, limit: int = 10) -> list[dict] | str:
    """
    Read announcements/forum posts for a course.

    Must be logged in first (call login tool).

    Args:
        course_id: The course ID (from list_courses).
        limit: Maximum number of announcements to fetch (default 10).

    Returns:
        List of announcements with title, author, date, url, and content.
    """
    if not _logged_in:
        return "Error: Not logged in. Call the login tool first."

    session = _get_session()
    result = _fetch_course_page(session, course_id)
    if isinstance(result, str):
        return result
    soup, course_name = result

    # Phase 1: Find announcements forum
    forum_url = None

    # Method 1: Forum activity with "announcement" in name
    for li in soup.find_all('li', class_=re.compile(r'modtype_forum')):
        a = li.find('a', href=True)
        if a and 'announcement' in a.get_text(strip=True).lower():
            href = a['href']
            forum_url = href if href.startswith('http') else 'https://mydy.dypatil.edu' + href
            break

    # Method 2: First forum link on page
    if not forum_url:
        for a in soup.find_all('a', href=re.compile(r'/mod/forum/view\.php\?id=\d+')):
            href = a['href']
            forum_url = href if href.startswith('http') else 'https://mydy.dypatil.edu' + href
            break

    if not forum_url:
        return "No announcements forum found for this course."

    # Phase 2: List discussions
    _rate_limit("activity")
    try:
        forum_resp = session.get(forum_url)
        forum_soup = BeautifulSoup(forum_resp.text, 'html.parser')
    except requests.RequestException as e:
        return f"Error loading forum: {str(e)}"

    discussions: list[dict] = []

    # Method 1: Table-based forum listing
    forum_table = forum_soup.find('table', class_=re.compile(r'forumheaderlist|discussion-list'))
    if forum_table:
        for row in forum_table.find_all('tr')[1:][:limit]:
            a = row.find('a', href=re.compile(r'/mod/forum/discuss\.php\?d=\d+'))
            if a:
                cells = row.find_all(['td', 'th'])
                href = a['href']
                disc_url = href if href.startswith('http') else 'https://mydy.dypatil.edu' + href
                title = a.get_text(strip=True)
                author = cells[1].get_text(strip=True) if len(cells) > 1 else None
                date = cells[-1].get_text(strip=True) if len(cells) > 2 else None
                discussions.append({"title": title, "url": disc_url, "author": author, "date": date})

    # Method 2: Fallback - scan all discussion links
    if not discussions:
        seen: set[str] = set()
        for a in forum_soup.find_all('a', href=re.compile(r'/mod/forum/discuss\.php\?d=\d+')):
            href = a['href']
            if href not in seen:
                seen.add(href)
                disc_url = href if href.startswith('http') else 'https://mydy.dypatil.edu' + href
                discussions.append({"title": a.get_text(strip=True), "url": disc_url, "author": None, "date": None})
                if len(discussions) >= limit:
                    break

    if not discussions:
        return []

    # Phase 3: Fetch content for each discussion
    results = []
    for disc in discussions:
        _rate_limit("activity")
        try:
            disc_resp = session.get(disc["url"])
            disc_soup = BeautifulSoup(disc_resp.text, 'html.parser')

            post = disc_soup.find('div', class_=re.compile(r'forumpost|forum-post'))
            content = None
            if post:
                content_div = post.find(class_=re.compile(r'posting|post-content'))
                content = content_div.get_text(strip=True) if content_div else None

                if not disc["author"]:
                    author_el = post.find(class_='author') or post.find('a', href=re.compile(r'/user/'))
                    disc["author"] = author_el.get_text(strip=True) if author_el else None

                if not disc["date"]:
                    date_el = post.find('time') or post.find(class_=re.compile(r'modified|date'))
                    disc["date"] = date_el.get_text(strip=True) if date_el else None

            results.append({
                "title": disc["title"],
                "author": disc["author"],
                "date": disc["date"],
                "url": disc["url"],
                "content": content,
            })
        except requests.RequestException:
            results.append({
                "title": disc["title"],
                "author": disc.get("author"),
                "date": disc.get("date"),
                "url": disc["url"],
                "content": "Error: could not load discussion",
            })

    return results


@mcp.tool()
def get_attendance() -> dict | str:
    """
    View attendance summary across all subjects for the current semester.

    Must be logged in first (call login tool). This fetches data from the
    Academic Status block on the dashboard.

    Returns:
        Dict with semester info, batch, and per-subject attendance (total_classes, present, absent, percentage).
    """
    if not _logged_in:
        return "Error: Not logged in. Call the login tool first."

    session = _get_session()
    _rate_limit("dashboard")

    url = "https://mydy.dypatil.edu/rait/blocks/academic_status/ajax.php?action=attendance"
    try:
        resp = session.get(url)
        if resp.status_code != 200:
            return f"Error: Attendance page returned status {resp.status_code}"
    except requests.RequestException as e:
        return f"Network error: {str(e)}"

    soup = BeautifulSoup(resp.text, 'html.parser')

    # Extract semester info
    batch = None
    semester = None
    header_divs = soup.find_all('div', style=re.compile(r'float'))
    for div in header_divs:
        text = div.get_text(strip=True)
        if re.match(r'^[A-Z]+-\d+-', text):
            batch = text
        elif 'Semester' in text:
            semester = text

    # Parse attendance table
    table = soup.find('table', class_='generaltable')
    if not table:
        return {"batch": batch, "semester": semester, "subjects": [], "message": "No attendance data found."}

    subjects = []
    for row in table.find_all('tr'):
        cells = row.find_all('td')
        if len(cells) < 5:
            continue

        subject = cells[0].get_text(strip=True)
        total = cells[1].get_text(strip=True)
        present = cells[2].get_text(strip=True)
        absent = cells[3].get_text(strip=True)
        percentage = cells[4].get_text(strip=True)

        subjects.append({
            "subject": subject,
            "total_classes": int(total) if total.isdigit() else total,
            "present": int(present) if present.isdigit() else present,
            "absent": int(absent) if absent.isdigit() else absent,
            "percentage": float(percentage) if percentage.replace('.', '', 1).isdigit() else percentage,
        })

    return {
        "batch": batch,
        "semester": semester,
        "subjects": subjects,
    }


if __name__ == "__main__":
    mcp.run()
