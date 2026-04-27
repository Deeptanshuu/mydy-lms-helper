"""
MyDy LMS HTTP Client

Synchronous HTTP client for the MyDy (Moodle-based) LMS.
No UI dependency — used by both the TUI app and MCP server.
"""

import os
import re
import time
import random
from urllib.parse import unquote

import requests
from bs4 import BeautifulSoup

BASE_URL = "https://mydy.dypatil.edu"
RAIT_URL = f"{BASE_URL}/rait"

MIN_DELAY = 0.5
MAX_DELAY = 0.5
DOWNLOAD_DELAY = 0.1


class MydyClient:
    """Synchronous HTTP client for the MyDy LMS."""

    def __init__(self):
        self.session = requests.Session()
        self.logged_in = False

    # -- helpers -----------------------------------------------------------

    def _rate_limit(self, operation_type: str = "general") -> None:
        if operation_type == "download":
            delay = random.uniform(MIN_DELAY + DOWNLOAD_DELAY, MAX_DELAY + DOWNLOAD_DELAY)
        else:
            delay = random.uniform(MIN_DELAY, MAX_DELAY)
        time.sleep(delay)

    @staticmethod
    def _sanitize_folder_name(name: str) -> str:
        return re.sub(r'[<>:"/\\|?*]', "_", name).strip()

    @staticmethod
    def _extract_course_name(soup: BeautifulSoup) -> str:
        title_tag = soup.find("title")
        if title_tag:
            title_text = title_tag.get_text()
            if "Course:" in title_text:
                return title_text.split("Course:", 1)[1].strip()
            return title_text.strip()
        return "Unknown Course"

    def _fetch_course_page(self, course_id: str) -> tuple[BeautifulSoup, str] | str:
        self._rate_limit("course")
        url = f"{RAIT_URL}/course/view.php?id={course_id}"
        try:
            resp = self.session.get(url)
            if resp.status_code != 200:
                return f"Error: Course page returned status {resp.status_code}"
            if "login" in resp.url and "course" not in resp.url:
                return "Error: Session expired. Please login again."
            soup = BeautifulSoup(resp.text, "html.parser")
            return (soup, self._extract_course_name(soup))
        except requests.RequestException as e:
            return f"Network error: {e}"

    @staticmethod
    def _get_activity_name(element) -> str:
        name_span = element.find("span", class_="instancename")
        if name_span:
            # Clone to avoid mutating the tree
            import copy
            clone = copy.copy(name_span)
            for hidden in clone.find_all("span", class_="accesshide"):
                hidden.decompose()
            return clone.get_text(strip=True)
        # Fallback: get just the first <a> direct text, not nested notification text
        a_tag = element.find("a", href=True)
        if a_tag:
            # Try to get only the direct text of the link, not child elements
            direct_text = a_tag.find(string=True, recursive=False)
            if direct_text and direct_text.strip():
                return direct_text.strip()
            return a_tag.get_text(strip=True)
        return ""

    # -- login -------------------------------------------------------------
    #
    # Returns a dict with rich error categorization so the UI can clearly
    # blame the LMS when it's flaky vs. the user when creds are wrong:
    #   {
    #     "success": bool,
    #     "kind": "ok" | "bad_credentials" | "lms_down" | "network_error"
    #             | "lms_unexpected" | "no_credentials",
    #     "message": "<short human-readable>",
    #     "detail": "<longer technical detail, optional>",
    #     "http_status": <int|None>,
    #     "retried": <int>,
    #   }
    # Transient failures (network_error, lms_down) are auto-retried with
    # exponential backoff. Bad credentials are NOT retried.

    LMS_DOWN_MARKERS = (
        "dns cache overflow", "service unavailable", "internal server error",
        "bad gateway", "gateway timeout", "502 bad gateway", "503 ",
        "temporarily unavailable", "maintenance",
    )

    def login(self, username: str = "", password: str = "",
              max_attempts: int = 3, on_retry=None) -> dict:
        username = username or os.getenv("MYDY_USERNAME", "")
        password = password or os.getenv("MYDY_PASSWORD", "")
        if not username or not password:
            return {
                "success": False, "kind": "no_credentials",
                "message": "Username and password are required.",
                "retried": 0,
            }

        backoff = [0, 2, 5, 10]
        last_result: dict = {}
        for attempt in range(max_attempts):
            if attempt > 0:
                delay = backoff[min(attempt, len(backoff) - 1)]
                if on_retry:
                    on_retry({"attempt": attempt + 1, "max_attempts": max_attempts,
                              "delay": delay, "previous": last_result})
                time.sleep(delay)
                # Fresh session each retry — old cookies may be stale
                self.session = requests.Session()

            last_result = self._login_once(username, password)
            last_result["retried"] = attempt
            if last_result["kind"] in ("ok", "bad_credentials", "no_credentials"):
                return last_result
            # Otherwise keep retrying transient failures
        return last_result

    def _login_once(self, username: str, password: str) -> dict:
        try:
            initial_resp = self.session.get(
                f"{RAIT_URL}/login/index.php", timeout=15,
            )
        except requests.Timeout:
            return self._lms_down(None, "Login page timed out — MyDy isn't responding.")
        except requests.ConnectionError as e:
            return {"success": False, "kind": "network_error",
                    "message": "Can't reach the internet.",
                    "detail": str(e), "http_status": None}
        except requests.RequestException as e:
            return {"success": False, "kind": "network_error",
                    "message": "Network error while reaching MyDy.",
                    "detail": str(e), "http_status": None}

        # 5xx or DNS-cache-overflow style body → MyDy is sick
        sick = self._is_lms_sick(initial_resp)
        if sick:
            return sick

        try:
            if initial_resp.url == f"{BASE_URL}/":
                payload = {"username": username, "wantsurl": "", "next": "Next"}
                step1 = self.session.post(f"{BASE_URL}/index.php", data=payload, timeout=15)
                sick = self._is_lms_sick(step1)
                if sick: return sick
                if "rait/login/index.php" in step1.url and "uname=" in step1.url:
                    moodle_resp = self.session.get(step1.url, timeout=15)
                else:
                    direct = f"{RAIT_URL}/login/index.php?uname={username}&wantsurl="
                    moodle_resp = self.session.get(direct, timeout=15)
                sick = self._is_lms_sick(moodle_resp)
                if sick: return sick
                login_soup = BeautifulSoup(moodle_resp.text, "html.parser")
            else:
                login_soup = BeautifulSoup(initial_resp.text, "html.parser")

            if not login_soup.find("input", {"name": "password"}):
                return {"success": False, "kind": "lms_down",
                        "message": "MyDy returned a broken login page.",
                        "detail": "No password field on the login page.",
                        "http_status": initial_resp.status_code}

            login_payload: dict[str, str] = {}
            for inp in login_soup.find_all("input", {"type": "hidden"}):
                name = inp.get("name")
                if name:
                    login_payload[name] = inp.get("value", "")
            login_payload["password"] = password

            form = login_soup.find("form")
            action = form["action"] if form and form.get("action") else f"{RAIT_URL}/login/index.php"
            if not action.startswith("http"):
                action = f"{RAIT_URL}/login/" + action.lstrip("/")

            resp = self.session.post(action, data=login_payload, timeout=20)
            sick = self._is_lms_sick(resp)
            if sick: return sick

            text_lower = resp.text.lower()
            has_login = BeautifulSoup(resp.text, "html.parser").find("input", {"name": "password"}) is not None
            has_error = any(x in text_lower for x in ["invalid login", "login failed", "incorrect"])
            has_success = any(x in text_lower for x in ["dashboard", "logout", "profile"])

            if has_error or (has_login and not has_success):
                self.logged_in = False
                return {"success": False, "kind": "bad_credentials",
                        "message": "That username or password didn't work.",
                        "detail": "MyDy rejected the credentials.",
                        "http_status": resp.status_code}

            if has_success or ("rait" in resp.url and "login" not in resp.url):
                self.logged_in = True
                masked = username[:2] + "****" + username[-2:] if len(username) > 4 else "****"
                return {"success": True, "kind": "ok",
                        "message": f"Logged in as {masked}",
                        "masked_user": masked, "http_status": resp.status_code}

            return {"success": False, "kind": "lms_unexpected",
                    "message": "MyDy responded in an unexpected way.",
                    "detail": f"Final URL: {resp.url}",
                    "http_status": resp.status_code}

        except requests.Timeout:
            return self._lms_down(None, "MyDy timed out during login.")
        except requests.RequestException as e:
            return {"success": False, "kind": "network_error",
                    "message": "Network error during login.",
                    "detail": str(e), "http_status": None}

    @classmethod
    def _is_lms_sick(cls, resp) -> dict | None:
        """Return an lms_down result if the response looks like a sick server."""
        if resp is None:
            return None
        if resp.status_code >= 500:
            return cls._lms_down(resp.status_code,
                                 f"MyDy returned HTTP {resp.status_code}.")
        body = (resp.text or "")[:2000].lower()
        if any(m in body for m in cls.LMS_DOWN_MARKERS):
            # Try to surface the marker for debugging
            hit = next((m for m in cls.LMS_DOWN_MARKERS if m in body), "")
            return cls._lms_down(resp.status_code,
                                 f"MyDy responded with: {hit!r}.")
        # Suspiciously tiny response when expecting HTML
        if resp.headers.get("content-type", "").startswith("text/html") and len(resp.text) < 200:
            return cls._lms_down(resp.status_code,
                                 f"MyDy returned only {len(resp.text)} bytes.")
        return None

    @staticmethod
    def _lms_down(http_status, detail) -> dict:
        return {
            "success": False, "kind": "lms_down",
            "message": "MyDy is having issues right now.",
            "detail": detail, "http_status": http_status,
        }

    # -- courses -----------------------------------------------------------

    def list_courses(self) -> list[dict] | str:
        if not self.logged_in:
            return "Not logged in."
        try:
            self._rate_limit("dashboard")
            resp = self.session.get(f"{RAIT_URL}/my/")
            if resp.status_code != 200:
                return f"Dashboard returned status {resp.status_code}"

            soup = BeautifulSoup(resp.text, "html.parser")
            courses: list[dict] = []
            seen: set[str] = set()

            def _add_links(container):
                for link in container.find_all("a", href=re.compile(r"/course/view\.php\?id=\d+")):
                    href = link.get("href", "")
                    m = re.search(r"id=(\d+)", href)
                    if m:
                        cid = m.group(1)
                        if cid not in seen:
                            name = link.get_text(strip=True)
                            if name and len(name) > 2:
                                seen.add(cid)
                                full = href if href.startswith("http") else BASE_URL + href
                                courses.append({"id": cid, "name": name, "url": full})

            block = soup.find("div", {"id": re.compile(r".*stu_previousclasses.*")})
            if block:
                _add_links(block)
            for nav in soup.find_all("div", class_=re.compile(r"block.*navigation|block.*tree|block.*university")):
                _add_links(nav)
            if not courses:
                _add_links(soup)

            courses.sort(key=lambda c: int(c["id"]), reverse=True)
            return courses if courses else "No courses found."
        except requests.RequestException as e:
            return f"Network error: {e}"

    # -- attendance --------------------------------------------------------

    def get_attendance(self) -> dict | str:
        if not self.logged_in:
            return "Not logged in."
        self._rate_limit("dashboard")
        try:
            resp = self.session.get(f"{RAIT_URL}/blocks/academic_status/ajax.php?action=attendance")
            if resp.status_code != 200:
                return f"Attendance returned status {resp.status_code}"
        except requests.RequestException as e:
            return f"Network error: {e}"

        soup = BeautifulSoup(resp.text, "html.parser")
        batch, semester = None, None
        for div in soup.find_all("div", style=re.compile(r"float")):
            text = div.get_text(strip=True)
            if re.match(r"^[A-Z]+-\d+-", text):
                batch = text
            elif "Semester" in text:
                semester = text

        table = soup.find("table", class_="generaltable")
        subjects: list[dict] = []
        if table:
            for row in table.find_all("tr"):
                cells = row.find_all("td")
                if len(cells) < 5:
                    continue
                t = [c.get_text(strip=True) for c in cells]
                subjects.append({
                    "subject": t[0],
                    "total_classes": int(t[1]) if t[1].isdigit() else t[1],
                    "present": int(t[2]) if t[2].isdigit() else t[2],
                    "absent": int(t[3]) if t[3].isdigit() else t[3],
                    "percentage": float(t[4]) if t[4].replace(".", "", 1).isdigit() else t[4],
                })
        return {"batch": batch, "semester": semester, "subjects": subjects}

    # -- course content ----------------------------------------------------

    def get_course_content(self, course_id: str) -> list[dict] | str:
        if not self.logged_in:
            return "Not logged in."
        result = self._fetch_course_page(course_id)
        if isinstance(result, str):
            return result
        soup, _ = result

        sections: list[dict] = []
        section_els = soup.find_all("li", class_=re.compile(r"\bsection\b"))
        if not section_els:
            section_els = soup.find_all("div", class_=re.compile(r"\bsection\b"))

        for sec in section_els:
            sid = sec.get("id", "")
            m = re.search(r"section-(\d+)", sid)
            num = int(m.group(1)) if m else None
            name_el = sec.find(class_="sectionname") or sec.find(["h3", "h4"])
            name = name_el.get_text(strip=True) if name_el else f"Section {num}"

            activities: list[dict] = []
            for act in sec.find_all("li", class_=re.compile(r"\bactivity\b")):
                cls = " ".join(act.get("class", []))
                tm = re.search(r"modtype_(\w+)", cls)
                atype = tm.group(1) if tm else "unknown"
                aname = self._get_activity_name(act)
                a_tag = act.find("a", href=True)
                if not a_tag:
                    continue
                href = a_tag["href"]
                url = href if href.startswith("http") else BASE_URL + href
                activities.append({"name": aname, "type": atype, "url": url})

            sections.append({"section_number": num, "section_name": name, "activities": activities})

        if not sections:
            all_acts: list[dict] = []
            for act in soup.find_all("li", class_=re.compile(r"\bactivity\b")):
                cls = " ".join(act.get("class", []))
                tm = re.search(r"modtype_(\w+)", cls)
                atype = tm.group(1) if tm else "unknown"
                aname = self._get_activity_name(act)
                a_tag = act.find("a", href=True)
                if not a_tag:
                    continue
                href = a_tag["href"]
                url = href if href.startswith("http") else BASE_URL + href
                all_acts.append({"name": aname, "type": atype, "url": url})
            if all_acts:
                sections = [{"section_number": 0, "section_name": "All Activities", "activities": all_acts}]
        return sections

    # -- assignments -------------------------------------------------------

    def get_assignments(self, course_id: str) -> list[dict] | str:
        if not self.logged_in:
            return "Not logged in."
        result = self._fetch_course_page(course_id)
        if isinstance(result, str):
            return result
        soup, _ = result

        # Only search within the course content area to avoid nav sidebar links
        content_area = soup.find("div", class_="course-content") or soup.find("div", id="region-main") or soup

        links: list[dict] = []
        for li in content_area.find_all("li", class_=re.compile(r"modtype_assign")):
            a = li.find("a", href=True)
            if a and "/mod/assign/view.php" in a["href"]:
                name = self._get_activity_name(li)
                href = a["href"]
                url = href if href.startswith("http") else BASE_URL + href
                links.append({"name": name, "url": url})

        if not links:
            seen: set[str] = set()
            for a in content_area.find_all("a", href=re.compile(r"/mod/assign/view\.php\?id=\d+")):
                href = a["href"]
                if href not in seen:
                    seen.add(href)
                    url = href if href.startswith("http") else BASE_URL + href
                    links.append({"name": a.get_text(strip=True), "url": url})

        assignments: list[dict] = []
        for asgn in links:
            self._rate_limit("activity")
            try:
                resp = self.session.get(asgn["url"])
                asoup = BeautifulSoup(resp.text, "html.parser")
                # Get clean name from the page heading
                h2 = asoup.find("h2")
                clean_name = h2.get_text(strip=True) if h2 else asgn["name"]
                info: dict = {"name": clean_name, "url": asgn["url"]}
                table = asoup.find("table", class_="submissionstatustable") or asoup.find("table", class_="generaltable")
                if table:
                    for row in table.find_all("tr"):
                        cells = row.find_all(["td", "th"])
                        if len(cells) >= 2:
                            label = cells[0].get_text(strip=True).lower()
                            value = cells[1].get_text(strip=True)
                            if "due date" in label:
                                info["due_date"] = value
                            elif "submission status" in label:
                                info["submission_status"] = value
                            elif "grading status" in label:
                                info["grading_status"] = value
                            elif "grade" in label and "grading" not in label:
                                info["grade"] = value
                            elif "time remaining" in label:
                                info["time_remaining"] = value
                for f in ("due_date", "submission_status", "grading_status", "grade", "time_remaining"):
                    info.setdefault(f, None)
                assignments.append(info)
            except requests.RequestException as e:
                assignments.append({"name": asgn["name"], "url": asgn["url"], "error": str(e),
                                    "due_date": None, "submission_status": None,
                                    "grading_status": None, "grade": None, "time_remaining": None})
        return assignments

    # -- grades ------------------------------------------------------------

    def get_grades(self, course_id: str) -> dict | str:
        if not self.logged_in:
            return "Not logged in."
        self._rate_limit("course")
        try:
            resp = self.session.get(f"{RAIT_URL}/grade/report/user/index.php?id={course_id}")
            if resp.status_code != 200:
                return f"Grade page returned status {resp.status_code}"
        except requests.RequestException as e:
            return f"Network error: {e}"

        soup = BeautifulSoup(resp.text, "html.parser")
        course_name = self._extract_course_name(soup)

        err = soup.find("div", class_="errorbox") or soup.find("div", class_=re.compile(r"alert-danger"))
        if err:
            return f"Error: {err.get_text(strip=True)}"

        table = (
            soup.find("table", class_=re.compile(r"user-grade"))
            or soup.find("table", id="user-grade")
            or soup.find("table", class_="generaltable")
        )
        if not table:
            return {"course_name": course_name, "grade_items": [], "course_total": None}

        headers: list[str] = []
        header_row = table.find("tr")
        if header_row:
            headers = [th.get_text(strip=True).lower() for th in header_row.find_all(["th", "td"])]

        col: dict[str, int] = {}
        for i, h in enumerate(headers):
            if "grade item" in h or ("item" in h and "name" not in col):
                col["name"] = i
            elif h == "grade" or ("grade" in h and "item" not in h and "grade" not in col):
                col["grade"] = i
            elif "range" in h:
                col["range"] = i
            elif "percentage" in h:
                col["percentage"] = i
            elif "feedback" in h:
                col["feedback"] = i

        def _cell(cells, key):
            idx = col.get(key)
            return cells[idx].get_text(strip=True) if idx is not None and idx < len(cells) else None

        items: list[dict] = []
        course_total = None
        for row in table.find_all("tr")[1:]:
            cells = row.find_all(["td", "th"])
            if not cells:
                continue
            item = {
                "name": _cell(cells, "name") or cells[0].get_text(strip=True),
                "grade": _cell(cells, "grade"),
                "range": _cell(cells, "range"),
                "percentage": _cell(cells, "percentage"),
                "feedback": _cell(cells, "feedback"),
            }
            if "course total" in (item["name"] or "").lower():
                course_total = {k: v for k, v in item.items() if k != "name"}
            else:
                rc = " ".join(row.get("class", []))
                if "category" in rc and not item.get("grade"):
                    continue
                items.append(item)

        return {"course_name": course_name, "grade_items": items, "course_total": course_total}

    # -- announcements -----------------------------------------------------

    def get_announcements(self, course_id: str, limit: int = 10) -> list[dict] | str:
        if not self.logged_in:
            return "Not logged in."
        result = self._fetch_course_page(course_id)
        if isinstance(result, str):
            return result
        soup, _ = result

        forum_url = None
        for li in soup.find_all("li", class_=re.compile(r"modtype_forum")):
            a = li.find("a", href=True)
            if a and "announcement" in a.get_text(strip=True).lower():
                href = a["href"]
                forum_url = href if href.startswith("http") else BASE_URL + href
                break
        if not forum_url:
            for a in soup.find_all("a", href=re.compile(r"/mod/forum/view\.php\?id=\d+")):
                href = a["href"]
                forum_url = href if href.startswith("http") else BASE_URL + href
                break
        if not forum_url:
            return "No announcements forum found."

        self._rate_limit("activity")
        try:
            freq = self.session.get(forum_url)
            fsoup = BeautifulSoup(freq.text, "html.parser")
        except requests.RequestException as e:
            return f"Error loading forum: {e}"

        discussions: list[dict] = []
        ftable = fsoup.find("table", class_=re.compile(r"forumheaderlist|discussion-list"))
        if ftable:
            for row in ftable.find_all("tr")[1:][:limit]:
                a = row.find("a", href=re.compile(r"/mod/forum/discuss\.php\?d=\d+"))
                if a:
                    cells = row.find_all(["td", "th"])
                    href = a["href"]
                    durl = href if href.startswith("http") else BASE_URL + href
                    discussions.append({
                        "title": a.get_text(strip=True),
                        "url": durl,
                        "author": cells[1].get_text(strip=True) if len(cells) > 1 else None,
                        "date": cells[-1].get_text(strip=True) if len(cells) > 2 else None,
                    })
        if not discussions:
            seen: set[str] = set()
            for a in fsoup.find_all("a", href=re.compile(r"/mod/forum/discuss\.php\?d=\d+")):
                href = a["href"]
                if href not in seen:
                    seen.add(href)
                    durl = href if href.startswith("http") else BASE_URL + href
                    discussions.append({"title": a.get_text(strip=True), "url": durl, "author": None, "date": None})
                    if len(discussions) >= limit:
                        break

        results: list[dict] = []
        for disc in discussions:
            self._rate_limit("activity")
            try:
                dr = self.session.get(disc["url"])
                ds = BeautifulSoup(dr.text, "html.parser")
                post = ds.find("div", class_=re.compile(r"forumpost|forum-post"))
                content = None
                if post:
                    cd = post.find(class_=re.compile(r"posting|post-content"))
                    content = cd.get_text(strip=True) if cd else None
                    if not disc["author"]:
                        ae = post.find(class_="author") or post.find("a", href=re.compile(r"/user/"))
                        disc["author"] = ae.get_text(strip=True) if ae else None
                    if not disc["date"]:
                        de = post.find("time") or post.find(class_=re.compile(r"modified|date"))
                        disc["date"] = de.get_text(strip=True) if de else None
                results.append({
                    "title": disc["title"], "author": disc["author"],
                    "date": disc["date"], "url": disc["url"], "content": content,
                })
            except requests.RequestException:
                results.append({
                    "title": disc["title"], "author": disc.get("author"),
                    "date": disc.get("date"), "url": disc["url"],
                    "content": "Error loading discussion.",
                })
        return results

    # -- download ----------------------------------------------------------

    def download_course_materials(self, course: dict, base_dir: str = ".",
                                  progress_callback=None) -> dict:
        if not self.logged_in:
            return {"error": "Not logged in."}
        self._rate_limit("course")
        try:
            resp = self.session.get(course["url"])
            soup = BeautifulSoup(resp.text, "html.parser")
        except requests.RequestException as e:
            return {"course_name": course["name"], "downloaded": 0, "failed": 0, "error": str(e)}

        course_name = self._extract_course_name(soup)
        folder = os.path.join(base_dir, self._sanitize_folder_name(course_name))
        os.makedirs(folder, exist_ok=True)

        activity_types = [
            "/mod/resource/view.php", "/mod/flexpaper/view.php",
            "/mod/presentation/view.php", "/mod/casestudy/view.php",
            "/mod/dyquestion/view.php",
        ]
        activity_links: list[str] = []
        for li in soup.find_all("li", class_=re.compile(r"\bactivity\b")):
            a = li.find("a", href=True)
            if a:
                href = a["href"]
                if any(x in href for x in activity_types):
                    activity_links.append(href if href.startswith("http") else BASE_URL + href)

        downloaded: list[dict] = []
        failed: list[str] = []

        for i, aurl in enumerate(activity_links):
            if progress_callback:
                progress_callback("activity", {"index": i + 1, "total": len(activity_links), "url": aurl})
            result = self._try_download_methods(aurl, folder, progress_callback)
            if result:
                downloaded.append(result)
                if progress_callback:
                    progress_callback("file_done", result)
            else:
                failed.append(aurl)

        return {
            "course_name": course_name,
            "folder": folder,
            "activities_found": len(activity_links),
            "downloaded": len(downloaded),
            "failed": len(failed),
            "files": downloaded,
        }

    def _try_download_methods(self, activity_url: str, folder: str,
                              progress_callback=None) -> dict | None:
        self._rate_limit("activity")
        try:
            resp = self.session.get(activity_url)
        except requests.RequestException:
            return None
        soup = BeautifulSoup(resp.text, "html.parser")

        for a in soup.find_all("a", href=True):
            href = a["href"]
            if "pluginfile.php" in href or href.endswith((".pdf", ".ppt", ".pptx", ".docx")):
                furl = href if href.startswith("http") else BASE_URL + href
                r = self._download_file(furl, folder, "direct", progress_callback)
                if r:
                    return r

        for pdf_url in re.findall(r"PDFFile\s*:\s*'([^']+)'", resp.text):
            r = self._download_file(pdf_url, folder, "flexpaper", progress_callback)
            if r:
                return r

        for a in soup.find_all("a", href=True):
            href = a["href"]
            if href.endswith((".ppt", ".pptx")):
                furl = href if href.startswith("http") else BASE_URL + href
                r = self._download_file(furl, folder, "presentation", progress_callback)
                if r:
                    return r

        iframe = soup.find("iframe", id="presentationobject")
        if iframe and iframe.has_attr("src"):
            r = self._download_file(iframe["src"], folder, "iframe", progress_callback)
            if r:
                return r

        obj = soup.find("object", id="presentationobject")
        if obj and obj.has_attr("data"):
            r = self._download_file(obj["data"], folder, "object", progress_callback)
            if r:
                return r

        return None

    def _download_file(self, url: str, folder: str, source_type: str,
                       progress_callback=None) -> dict | None:
        try:
            self._rate_limit("download")
            start = time.time()
            freq = self.session.get(url, stream=True)
            if freq.status_code != 200:
                return None

            filename = unquote(url.split("/")[-1])
            if "?" in filename:
                filename = filename.split("?")[0]
            filepath = os.path.join(folder, filename)
            total = int(freq.headers.get("content-length", 0))

            if os.path.exists(filepath) and total > 0 and os.path.getsize(filepath) == total:
                return {"filename": filename, "size_bytes": total, "status": "skipped", "source": source_type}

            dl = 0
            with open(filepath, "wb") as f:
                for chunk in freq.iter_content(chunk_size=8192):
                    if chunk:
                        f.write(chunk)
                        dl += len(chunk)

            elapsed = time.time() - start
            return {
                "filename": filename, "size_bytes": dl,
                "download_time": round(elapsed, 2),
                "status": "downloaded", "source": source_type,
            }
        except Exception as e:
            return {"filename": url.split("/")[-1], "status": "error", "error": str(e)}

    # -- hit rate maxxer ---------------------------------------------------
    #
    # Brings a course's "Course Progress" widget to 100% by GET-ing every
    # not-yet-viewed activity. The widget's data source is customview.php,
    # which lists each activity link with class="completed" or class="pending".
    # A simple GET on a "pending" /mod/<type>/view.php?id=N flips it to
    # "completed" and bumps the Viewed counter by 1. Verified live.

    def get_course_progress(self, course_id: str) -> dict:
        """Fetch the current viewed/total state for one course.

        Returns:
            {
              "total": int, "viewed": int, "not_viewed": int, "percent": int,
              "pending":   [{"url", "name"}, ...],   # not yet viewed
              "completed": [{"url", "name"}, ...],   # already viewed
            }
        """
        if not self.logged_in:
            return {"error": "Not logged in."}
        self._rate_limit("course")
        try:
            resp = self.session.get(
                f"{RAIT_URL}/course/customview.php?id={course_id}"
            )
        except requests.RequestException as e:
            return {"error": str(e)}
        soup = BeautifulSoup(resp.text, "html.parser")

        pending: list[dict] = []
        completed: list[dict] = []
        for a in soup.find_all("a", class_=True):
            cls = a.get("class") or []
            if "pending" not in cls and "completed" not in cls:
                continue
            href = a.get("href", "")
            if "/mod/" not in href or "/view.php" not in href:
                continue
            div = a.find("div")
            text = (div.get_text(separator=" ", strip=True)
                    if div else a.get_text(strip=True))
            name = re.sub(r"\s+", " ", text.replace("\xa0", " ")).strip() or "Activity"
            item = {"url": href, "name": name}
            (completed if "completed" in cls else pending).append(item)

        total = len(pending) + len(completed)
        return {
            "total": total,
            "viewed": len(completed),
            "not_viewed": len(pending),
            "percent": round(len(completed) / total * 100) if total else 0,
            "pending": pending,
            "completed": completed,
        }

    @staticmethod
    def _course_id_from(course: dict) -> str:
        cid = str(course.get("id") or "")
        if cid:
            return cid
        m = re.search(r"id=(\d+)", course.get("url", ""))
        return m.group(1) if m else ""

    def mark_activity_viewed(self, url: str) -> dict:
        """GET an activity's view.php URL — this is what increments the widget."""
        if not self.logged_in:
            return {"url": url, "status": "error", "error": "Not logged in."}
        self._rate_limit("activity")
        try:
            r = self.session.get(url, allow_redirects=True)
            ok = r.status_code in (200, 302, 303)
            return {"url": url, "status": "marked" if ok else "error",
                    "http_status": r.status_code}
        except requests.RequestException as e:
            return {"url": url, "status": "error", "error": str(e)}

    def hit_rate_maxx_course(self, course: dict, progress_callback=None) -> dict:
        """Bring one course's Course Progress widget to 100%.

        GETs every activity in the course's "pending" set (per customview.php).
        Already-viewed activities are not touched. Returns before/after counts.
        """
        if not self.logged_in:
            return {"course_name": course.get("name", ""), "error": "Not logged in."}
        cid = self._course_id_from(course)
        if not cid:
            return {"course_name": course.get("name", ""),
                    "error": "Course id not found."}

        progress = self.get_course_progress(cid)
        if "error" in progress:
            return {"course_name": course.get("name", ""), "error": progress["error"]}

        pending = progress["pending"]
        if progress_callback:
            progress_callback("course_start", {
                "course": course.get("name", ""),
                "total": progress["total"],
                "viewed_before": progress["viewed"],
                "pending_count": len(pending),
                "percent_before": progress["percent"],
            })

        marked: list[dict] = []
        failed: list[dict] = []
        for i, item in enumerate(pending):
            if progress_callback:
                progress_callback("activity", {
                    "index": i + 1, "total": len(pending),
                    "name": item["name"], "url": item["url"],
                })
            r = self.mark_activity_viewed(item["url"])
            r["name"] = item["name"]
            (marked if r.get("status") == "marked" else failed).append(r)
            if progress_callback:
                progress_callback("item_done", r)

        # Re-fetch to report the actual after-state (matches what the user sees).
        after = self.get_course_progress(cid)
        return {
            "course_name": course.get("name", ""),
            "total": progress["total"],
            "viewed_before": progress["viewed"],
            "viewed_after": after.get("viewed", progress["viewed"] + len(marked)),
            "percent_before": progress["percent"],
            "percent_after": after.get("percent", 0),
            "marked": len(marked),
            "skipped": progress["viewed"],          # already-viewed, untouched
            "failed": len(failed),
            "items": {"marked": marked, "skipped": progress["completed"],
                      "failed": failed},
        }

    def hit_rate_maxx_all(self, courses: list[dict] | None = None,
                          progress_callback=None) -> dict:
        if not self.logged_in:
            return {"error": "Not logged in."}
        if courses is None:
            listing = self.list_courses()
            if isinstance(listing, str):
                return {"error": listing}
            courses = listing

        results: list[dict] = []
        for idx, co in enumerate(courses):
            if progress_callback:
                progress_callback("course", {
                    "index": idx + 1, "total": len(courses), "course": co,
                })
            results.append(self.hit_rate_maxx_course(co, progress_callback=progress_callback))

        total_marked = sum(r.get("marked", 0) for r in results)
        total_failed = sum(r.get("failed", 0) for r in results)
        already_viewed = sum(r.get("skipped", 0) for r in results)
        return {
            "summary": {
                "courses_processed": len(results),
                "total_newly_marked": total_marked,
                "total_already_viewed": already_viewed,
                "total_failed": total_failed,
            },
            "courses": results,
        }
