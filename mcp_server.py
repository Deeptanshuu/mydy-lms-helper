"""
MyDy LMS Helper - MCP Server

An MCP (Model Context Protocol) server that exposes tools for interacting with
the MyDy (Moodle-based) Learning Management System at D.Y. Patil institutions.

Tools:
  - login: Authenticate with the LMS
  - list_courses: Get available courses from the dashboard
  - download_course_materials: Download all materials from specified courses

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
    instructions="Tools for interacting with the MyDy (Moodle) LMS - login, list courses, and download course materials.",
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


if __name__ == "__main__":
    mcp.run()
