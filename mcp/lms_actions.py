"""
Course-progress ("hit rate"), forum, quiz, submission and drill-down actions for the MyDy MCP server.

Every function takes the signed-in `requests.Session` from mcp_server.py and returns plain dicts and
lists. Errors come back as {"status": "error", "error": ...} or {"error": ...}, never as exceptions, so a
tool can report what went wrong for one activity and carry on with the rest.

Unlike the read-only tools, several of these act on the student's account: max_course() posts to
forums and takes quiz attempts, solve_quiz_to_perfect() takes quiz attempts, submit_assignment()
uploads a file. Callers must say so to the user before running them.
"""

from __future__ import annotations

import mimetypes
import os
import re
import time
from urllib.parse import parse_qs, unquote, urlparse

import requests
from bs4 import BeautifulSoup

BASE_URL = "https://mydy.dypatil.edu"
RAIT_URL = f"{BASE_URL}/rait"

# Pause between requests, matching the rest of the server.
REQUEST_DELAY = 0.5

# Forum posts made only to register participation carry this, so nothing readable shows up for classmates.
ZERO_WIDTH_SPACE = "​"

# Activity types that usually lead to a downloadable file.
MATERIAL_PATHS = (
    "/mod/resource/view.php",
    "/mod/flexpaper/view.php",
    "/mod/presentation/view.php",
    "/mod/casestudy/view.php",
    "/mod/dyquestion/view.php",
)
DIRECT_EXTS = (".pdf", ".ppt", ".pptx", ".docx", ".doc", ".xlsx", ".csv")


# -- helpers --------------------------------------------------------------------------------------


def _pause() -> None:
    time.sleep(REQUEST_DELAY)


def _clean_text(el) -> str:
    """get_text() with runs of whitespace collapsed to single spaces."""
    return re.sub(r"\s+", " ", el.get_text(" ", strip=True)).strip() if el else ""


def _abs(href: str) -> str:
    return href if href.startswith("http") else BASE_URL + href


def _is_mydy(url: str) -> bool:
    return urlparse(url).netloc.lower() == "mydy.dypatil.edu"


def _activity_name(element) -> str:
    """An activity's name without Moodle's screen-reader-only suffix (" File", " Forum", ...)."""
    span = element.find("span", class_="instancename")
    if span:
        parts = [s for s in span.find_all(string=True) if not s.find_parent("span", class_="accesshide")]
        return re.sub(r"\s+", " ", "".join(parts)).strip()
    a = element if element.name == "a" else element.find("a", href=True)
    if a:
        direct = a.find(string=True, recursive=False)
        if direct and direct.strip():
            return direct.strip()
        return a.get_text(strip=True)
    return ""


def _get(session: requests.Session, url: str) -> requests.Response | None:
    _pause()
    try:
        return session.get(url)
    except requests.RequestException:
        return None


def _soup(session: requests.Session, url: str) -> BeautifulSoup | None:
    resp = _get(session, url)
    return BeautifulSoup(resp.text, "html.parser") if resp is not None else None


def _course_soup(session: requests.Session, course_id: str) -> BeautifulSoup | None:
    return _soup(session, f"{RAIT_URL}/course/view.php?id={course_id}")


def _status_table_value(soup: BeautifulSoup, label: str) -> str:
    """The value next to `label` in an assignment's submission status table, or ""."""
    table = soup.find("table", class_="submissionstatustable") or soup.find("table", class_="generaltable")
    if not table:
        return ""
    for row in table.find_all("tr"):
        cells = row.find_all(["td", "th"])
        if len(cells) >= 2 and label in cells[0].get_text(strip=True).lower():
            return cells[1].get_text(strip=True)
    return ""


def is_submitted(status: str) -> bool:
    """MyDy's "Submitted for grading" counts; "No attempt" and "Not submitted" don't."""
    low = status.lower()
    return "submitted" in low and "not submitted" not in low


# -- course progress ("hit rate") ----------------------------------------------------------------
#
# The Course Progress widget reads course/customview.php, which lists every tracked activity as a
# link with class "completed" or "pending". Opening a pending activity's view.php flips it to
# completed and adds one to the widget's Viewed count.


def course_progress(session: requests.Session, course_id: str) -> dict:
    """Viewed / total / percent for one course, plus the pending and completed activities."""
    resp = _get(session, f"{RAIT_URL}/course/customview.php?id={course_id}")
    if resp is None:
        return {"error": "Can't reach MyDy."}
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
        text = div.get_text(separator=" ", strip=True) if div else a.get_text(strip=True)
        name = re.sub(r"\s+", " ", text.replace("\xa0", " ")).strip() or "Activity"
        (completed if "completed" in cls else pending).append({"url": _abs(href), "name": name})

    total = len(pending) + len(completed)
    return {
        "total": total,
        "viewed": len(completed),
        "not_viewed": len(pending),
        "percent": round(len(completed) / total * 100) if total else 0,
        "pending": pending,
        "completed": completed,
    }


def mark_viewed(session: requests.Session, url: str) -> dict:
    """Open an activity: this is what moves it from pending to completed."""
    _pause()
    try:
        r = session.get(url, allow_redirects=True)
    except requests.RequestException as e:
        return {"url": url, "status": "error", "error": str(e)}
    ok = r.status_code in (200, 302, 303)
    return {"url": url, "status": "marked" if ok else "error", "http_status": r.status_code}


def max_course(session: requests.Session, course_id: str) -> dict:
    """
    Bring one course's progress to 100%: open every pending activity, post to forums the student
    hasn't posted in, and bring quizzes without a full-marks attempt to one. Returns before/after.
    """
    before = course_progress(session, course_id)
    if "error" in before:
        return before

    marked: list[dict] = []
    failed: list[dict] = []
    for item in before["pending"]:
        r = mark_viewed(session, item["url"])
        r["name"] = item["name"]
        (marked if r["status"] == "marked" else failed).append(r)

    forum_posts = ensure_forum_posts(session, course_id)
    quiz_solves = solve_pending_quizzes(session, course_id)

    after = course_progress(session, course_id)
    return {
        "total": before["total"],
        "viewed_before": before["viewed"],
        "viewed_after": after.get("viewed", before["viewed"] + len(marked)),
        "percent_before": before["percent"],
        "percent_after": after.get("percent", before["percent"]),
        "marked": len(marked),
        "failed": [{"name": f["name"], "url": f["url"], "error": f.get("error") or f"HTTP {f.get('http_status')}"} for f in failed],
        "forum_posts": forum_posts,
        "quiz_solves": quiz_solves,
        "pending_before": before["pending"],
    }


# -- forums ---------------------------------------------------------------------------------------


def own_user_id(session: requests.Session) -> str | None:
    cached = getattr(session, "_mydy_user_id", None)
    if cached:
        return cached
    resp = _get(session, f"{RAIT_URL}/my/")
    if resp is None:
        return None
    m = re.search(r"profilechange/changeprofile\.php\?id=(\d+)", resp.text) or re.search(r"/user/profile\.php\?id=(\d+)", resp.text)
    if not m:
        return None
    session._mydy_user_id = m.group(1)  # type: ignore[attr-defined]
    return m.group(1)


def _normalize(name: str) -> str:
    return re.sub(r"\s+", " ", name).strip()


def _course_activities(session: requests.Session, course_id: str, module: str, fallback: str) -> list[dict]:
    """Every <module> activity linked from the course page (not just completion-tracked ones)."""
    soup = _course_soup(session, course_id)
    if soup is None:
        return []
    out: list[dict] = []
    seen: set[str] = set()
    for a in soup.find_all("a", href=re.compile(rf"/mod/{module}/view\.php\?id=\d+")):
        cmid = re.search(r"id=(\d+)", a["href"]).group(1)
        if cmid in seen:
            continue
        seen.add(cmid)
        name = _normalize(_activity_name(a) or _clean_text(a) or fallback)
        out.append({"cmid": cmid, "name": name, "url": _abs(a["href"])})
    return out


def _forums_with_my_posts(session: requests.Session, course_id: str, userid: str) -> set[str]:
    """
    Names of the forums (as the post breadcrumbs spell them) where this student already has a post.
    mod/forum/user.php shows 5 posts a page: every page must be read or older posts drop out of the set.
    """
    names: set[str] = set()
    page = 0
    while page < 200:
        soup = _soup(session, f"{RAIT_URL}/mod/forum/user.php?id={userid}&course={course_id}&mode=posts&page={page}")
        if soup is None:
            break
        posts = soup.find_all("div", class_="forumpost")
        if not posts:
            break
        for post in posts:
            subject = post.find("div", class_="subject")
            spans = subject.find_all("span", recursive=False) if subject else []
            if len(spans) >= 2:
                names.add(_normalize(_clean_text(spans[1])))
        if not soup.find("a", string=re.compile(r"Next", re.IGNORECASE)):
            break
        page += 1
    return names


def _forum_id_from_view(session: requests.Session, forum_view_url: str) -> str | None:
    resp = _get(session, forum_view_url)
    if resp is None:
        return None
    m = re.search(r"forum/post\.php\?forum=(\d+)", resp.text) or re.search(r'name="forum"\s+value="(\d+)"', resp.text)
    return m.group(1) if m else None


def post_forum_discussion(session: requests.Session, forum_id: str, subject: str, message: str) -> dict:
    """Start a new discussion in a forum. `message` is posted as the body, wrapped in a <p>."""
    soup = _soup(session, f"{RAIT_URL}/mod/forum/post.php?forum={forum_id}")
    form = soup.find("form", id="mformforum") if soup else None
    if not form:
        return {"status": "error", "error": "No post form (the forum may not allow new discussions)."}

    fields = [(i.get("name"), i.get("value", "")) for i in form.find_all("input", attrs={"type": "hidden"}) if i.get("name")]
    if not any(n == "sesskey" for n, _ in fields):
        return {"status": "error", "error": "No sesskey on the post form."}
    if not any(n == "message[itemid]" for n, _ in fields):
        return {"status": "error", "error": "No message draft item on the post form."}
    fields += [("subject", subject), ("message[text]", f"<p>{message}</p>"), ("submitbutton", "Post to forum")]

    _pause()
    try:
        resp = session.post(f"{RAIT_URL}/mod/forum/post.php", data=fields)
    except requests.RequestException as e:
        return {"status": "error", "error": f"Couldn't post: {e}"}
    if resp.status_code != 200:
        return {"status": "error", "error": f"Post returned HTTP {resp.status_code}"}

    posted_url = None
    check = _soup(session, f"{RAIT_URL}/mod/forum/view.php?f={forum_id}")
    if check:
        for a in check.find_all("a", href=True):
            if _clean_text(a) == subject.strip():
                posted_url = a["href"]
                break
    return {"status": "posted" if posted_url else "posted_unverified", "forum_id": str(forum_id), "url": posted_url}


def ensure_forum_posts(session: requests.Session, course_id: str) -> dict:
    """
    Post an invisible (zero-width space) discussion to every forum in the course where the student has
    no post yet. "Has a post" is checked against the real post history, not the viewed tracker: a forum
    can show as viewed while the student never posted in it.
    """
    userid = own_user_id(session)
    if not userid:
        return {"error": "Couldn't find your MyDy user id."}

    forums = _course_activities(session, course_id, "forum", "Forum")
    already = _forums_with_my_posts(session, course_id, userid)

    posted: list[str] = []
    skipped: list[str] = []
    failed: list[dict] = []
    for forum in forums:
        # Match on whitespace-normalised names on both sides, or a double space in one scrape makes a duplicate post.
        if forum["name"] in already:
            skipped.append(forum["name"])
            continue
        forum_id = _forum_id_from_view(session, forum["url"])
        if not forum_id:
            failed.append({"name": forum["name"], "error": "No forum id (it may not allow new discussions)."})
            continue
        r = post_forum_discussion(session, forum_id, ZERO_WIDTH_SPACE, ZERO_WIDTH_SPACE)
        if r["status"] in ("posted", "posted_unverified"):
            posted.append(forum["name"])
        else:
            failed.append({"name": forum["name"], "error": r.get("error")})

    return {"forums_total": len(forums), "posted": posted, "already_posted": skipped, "failed": failed}


# -- quizzes --------------------------------------------------------------------------------------


def quiz_attempt_stats(session: requests.Session, quiz_cmid: str) -> dict | None:
    """Attempts used and allowed, and whether any past attempt scored full marks."""
    soup = _soup(session, f"{RAIT_URL}/mod/quiz/view.php?id={quiz_cmid}")
    if soup is None:
        return None

    allowed_m = re.search(r"Attempts allowed:\s*(\d+)", soup.get_text(" "))
    allowed = int(allowed_m.group(1)) if allowed_m else None

    table = soup.find("table", class_="quizattemptsummary")
    rows = table.find_all("tr") if table else []
    if not rows:
        return {"attempts_used": 0, "attempts_allowed": allowed, "has_perfect": False}

    header = [_clean_text(c) for c in rows[0].find_all(["th", "td"])]
    grade_col = next((i for i, h in enumerate(header) if h.lower().startswith("grade")), None)
    max_grade = None
    if grade_col is not None:
        m = re.search(r"/\s*([\d.]+)", header[grade_col])
        max_grade = float(m.group(1)) if m else None

    has_perfect = False
    for row in rows[1:]:
        if grade_col is None or max_grade is None:
            break
        cells = [_clean_text(c) for c in row.find_all(["th", "td"])]
        m = re.match(r"([\d.]+)", cells[grade_col]) if grade_col < len(cells) else None
        if m and float(m.group(1)) >= max_grade - 1e-6:
            has_perfect = True

    return {"attempts_used": len(rows) - 1, "attempts_allowed": allowed, "has_perfect": has_perfect}


def start_quiz_attempt(session: requests.Session, quiz_cmid: str) -> dict:
    """Begin a fresh attempt. This uses up one of the quiz's attempts."""
    soup = _soup(session, f"{RAIT_URL}/mod/quiz/view.php?id={quiz_cmid}")
    sesskey_input = soup.find("input", {"name": "sesskey"}) if soup else None
    if not sesskey_input:
        return {"status": "error", "error": "No sesskey on the quiz page (it may not be open)."}
    _pause()
    try:
        resp = session.post(f"{RAIT_URL}/mod/quiz/startattempt.php", data={"cmid": str(quiz_cmid), "sesskey": sesskey_input["value"]})
    except requests.RequestException as e:
        return {"status": "error", "error": f"Couldn't start an attempt: {e}"}
    m = re.search(r"attempt=(\d+)", resp.url)
    if not m:
        return {"status": "error", "error": f"No attempt id in the redirect ({resp.url})."}
    return {"status": "started", "attempt_id": m.group(1)}


def quiz_attempt_questions(session: requests.Session, attempt_id: str) -> dict | str:
    """Read-only: the questions and options on an attempt's first page."""
    soup = _soup(session, f"{RAIT_URL}/mod/quiz/attempt.php?attempt={attempt_id}")
    form = soup.find("form", id="responseform") if soup else None
    if not form:
        return "No attempt form (the attempt may be finished or invalid)."
    questions = []
    for qdiv in form.find_all("div", id=re.compile(r"^q\d+$")):
        answer = qdiv.find("div", class_="answer")
        options = []
        if answer:
            for inp in answer.find_all("input", attrs={"type": ["radio", "checkbox"]}):
                label = answer.find("label", attrs={"for": inp.get("id")}) if inp.get("id") else None
                options.append({"name": inp.get("name"), "value": inp.get("value"), "text": _clean_text(label)})
        questions.append({"slot": int(qdiv["id"][1:]), "text": _clean_text(qdiv.find("div", class_="qtext")), "options": options})
    questions.sort(key=lambda q: q["slot"])
    return {"attempt_id": str(attempt_id), "questions": questions}


def submit_quiz_attempt(session: requests.Session, attempt_id: str, answers: dict[int, str]) -> dict:
    """
    Answer and finish an attempt, page by page. `answers` maps slot -> option text (an exact label
    match wins, else the first label containing it). Slots left out keep whatever is selected.
    """
    sesskey = None
    page = 0
    for _ in range(100):
        url = f"{RAIT_URL}/mod/quiz/attempt.php?attempt={attempt_id}" + (f"&page={page}" if page else "")
        soup = _soup(session, url)
        form = soup.find("form", id="responseform") if soup else None
        if not form:
            return {"status": "error", "error": f"No attempt form on page {page} (the attempt may be finished)."}

        # Hidden state, sequence checks and so on go back verbatim.
        fields: list[tuple[str, str]] = []
        for inp in form.find_all("input"):
            name = inp.get("name")
            if name and (inp.get("type") or "text").lower() not in ("radio", "checkbox", "submit"):
                fields.append((name, inp.get("value", "")))
        for ta in form.find_all("textarea"):
            if ta.get("name"):
                fields.append((ta["name"], ta.text or ""))
        for sel in form.find_all("select"):
            if sel.get("name"):
                opt = sel.find("option", selected=True) or sel.find("option")
                fields.append((sel["name"], opt.get("value", "") if opt else ""))

        sesskey = next((v for n, v in fields if n == "sesskey"), sesskey)
        if not sesskey:
            return {"status": "error", "error": "No sesskey on the attempt page."}
        nextpage = next((v for n, v in fields if n == "nextpage"), "-1")

        unmatched = []
        for qdiv in form.find_all("div", id=re.compile(r"^q\d+$")):
            slot = int(qdiv["id"][1:])
            answer = qdiv.find("div", class_="answer")
            if not answer:
                continue
            inputs = answer.find_all("input", attrs={"type": ["radio", "checkbox"]})
            if slot in answers:
                target = answers[slot].strip().lower()
                exact = partial = None
                for inp in inputs:
                    label = answer.find("label", attrs={"for": inp.get("id")}) if inp.get("id") else None
                    text = _clean_text(label).lower()
                    if text == target:
                        exact = inp
                        break
                    if partial is None and target in text:
                        partial = inp
                choice = exact or partial
                if choice is None:
                    unmatched.append(slot)
                else:
                    fields.append((choice["name"], choice.get("value", "")))
            else:
                checked = next((i for i in inputs if i.has_attr("checked")), None)
                if checked:
                    fields.append((checked["name"], checked.get("value", "")))
        if unmatched:
            return {"status": "error", "error": f"No option matched the answer for question(s) {unmatched} (page {page})."}

        fields.append(("next", "Next"))
        _pause()
        try:
            resp = session.post(f"{RAIT_URL}/mod/quiz/processattempt.php", files=[(n, (None, v)) for n, v in fields])
        except requests.RequestException as e:
            return {"status": "error", "error": f"Couldn't save page {page}: {e}"}
        if resp.status_code not in (200, 303):
            return {"status": "error", "error": f"Saving page {page} returned HTTP {resp.status_code}"}

        if nextpage == "-1":
            break
        try:
            page = int(nextpage)
        except ValueError:
            break

    _pause()
    try:
        resp = session.post(
            f"{RAIT_URL}/mod/quiz/processattempt.php",
            data={"attempt": str(attempt_id), "finishattempt": "1", "timeup": "0", "slots": "", "sesskey": sesskey},
        )
    except requests.RequestException as e:
        return {"status": "error", "error": f"Couldn't finish the attempt: {e}"}
    if resp.status_code not in (200, 303):
        return {"status": "error", "error": f"Finishing the attempt returned HTTP {resp.status_code}"}

    grade = state = None
    review = _soup(session, f"{RAIT_URL}/mod/quiz/review.php?attempt={attempt_id}")
    table = review.find("table") if review else None
    for row in table.find_all("tr") if table else []:
        cells = row.find_all(["th", "td"])
        if len(cells) >= 2:
            label = cells[0].get_text(strip=True).lower()
            if label == "state":
                state = cells[1].get_text(strip=True)
            elif label == "grade":
                grade = cells[1].get_text(strip=True)
    return {"status": "submitted", "attempt_id": str(attempt_id), "state": state, "grade": grade}


def quiz_review_answer_key(session: requests.Session, attempt_id: str) -> dict | str:
    """The correct answer Moodle shows for each question on a finished attempt's review page."""
    soup = _soup(session, f"{RAIT_URL}/mod/quiz/review.php?attempt={attempt_id}")
    if soup is None:
        return "Couldn't load the review page."
    answers: dict[int, str] = {}
    for qdiv in soup.find_all("div", id=re.compile(r"^q\d+$")):
        text = _clean_text(qdiv.find("div", class_="rightanswer"))
        # Multiple choice: "The correct answer is: X". True/false: "The correct answer is 'X'."
        text = re.sub(r"^The correct answer is:?\s*", "", text, flags=re.IGNORECASE).strip("'\" .")
        if text:
            answers[int(qdiv["id"][1:])] = text
    return {"attempt_id": str(attempt_id), "answers": answers}


def solve_quiz_to_perfect(session: requests.Session, quiz_cmid: str) -> dict:
    """
    Make sure a quiz has a full-marks attempt. If none exists: take a throwaway probe attempt (first
    option everywhere), read the answer key its review page discloses, then take a second attempt with
    those answers. Needs room for two more attempts and a quiz that shows correct answers on review.
    """
    stats = quiz_attempt_stats(session, quiz_cmid)
    if stats is None:
        return {"status": "error", "error": "Couldn't read the quiz's attempt history."}
    if stats["has_perfect"]:
        return {"status": "already_perfect"}
    if stats["attempts_allowed"] is not None:
        left = stats["attempts_allowed"] - stats["attempts_used"]
        if left < 2:
            return {"status": "skipped", "error": f"Only {left} attempt(s) left of {stats['attempts_allowed']}: not enough for a probe and a real attempt."}

    probe = start_quiz_attempt(session, quiz_cmid)
    if probe["status"] != "started":
        return {"status": "error", "error": f"Probe attempt: {probe['error']}"}
    questions = quiz_attempt_questions(session, probe["attempt_id"])
    if isinstance(questions, str):
        return {"status": "error", "error": f"Probe attempt: {questions}"}
    first_options = {q["slot"]: q["options"][0]["text"] for q in questions["questions"] if q["options"]}
    probe_done = submit_quiz_attempt(session, probe["attempt_id"], first_options)
    if probe_done["status"] != "submitted":
        return {"status": "error", "error": f"Probe attempt: {probe_done['error']}"}

    key = quiz_review_answer_key(session, probe["attempt_id"])
    if isinstance(key, str):
        return {"status": "error", "error": key}
    if not key["answers"]:
        return {"status": "error", "error": "The quiz doesn't show correct answers on review.", "probe_grade": probe_done.get("grade")}

    solve = start_quiz_attempt(session, quiz_cmid)
    if solve["status"] != "started":
        return {"status": "error", "error": f"Second attempt: {solve['error']}"}
    solve_done = submit_quiz_attempt(session, solve["attempt_id"], key["answers"])
    if solve_done["status"] != "submitted":
        return {"status": "error", "error": f"Second attempt: {solve_done['error']}"}

    final = quiz_attempt_stats(session, quiz_cmid)
    return {
        "status": "solved" if final and final["has_perfect"] else "attempted_not_perfect",
        "probe_grade": probe_done.get("grade"),
        "solve_grade": solve_done.get("grade"),
    }


def solve_pending_quizzes(session: requests.Session, course_id: str) -> dict:
    quizzes = _course_activities(session, course_id, "quiz", "Quiz")
    results = []
    for quiz in quizzes:
        r = solve_quiz_to_perfect(session, quiz["cmid"])
        r["name"] = quiz["name"]
        results.append(r)
    return {"quizzes_total": len(quizzes), "results": results}


# -- assignment submission -----------------------------------------------------------------------


def assignment_status(session: requests.Session, assign_url: str) -> dict:
    """Name and submission status of one assignment."""
    soup = _soup(session, assign_url)
    if soup is None:
        return {"url": assign_url, "error": "Can't reach MyDy."}
    h2 = soup.find("h2")
    return {"url": assign_url, "name": h2.get_text(strip=True) if h2 else assign_url, "submission_status": _status_table_value(soup, "submission status")}


def _why_no_submission(soup: BeautifulSoup) -> str:
    """Why the edit page offered no file submission form, from Moodle's own notices."""
    text = re.sub(r"\s+", " ", soup.get_text(" ", strip=True))
    low = text.lower()
    for needle, message in (
        ("not accepting submission", "This assignment is not accepting submissions."),
        ("not allowed to submit", "You are not allowed to submit this assignment."),
        ("submissions are not being accepted", "Submissions are not being accepted for this assignment."),
        ("no longer accept", "The submission window has closed."),
        ("cut-off date has passed", "The cut-off date has passed."),
    ):
        if needle in low:
            return message
    opens = re.search(r"allowed from[^.\n]{0,80}", text, re.I)
    if opens:
        return f"The submission window isn't open yet: {opens.group(0).strip()}."
    return "No file submission is available: it may not be open yet, may have closed, or may not take file uploads."


def submit_assignment(session: requests.Session, assign_url: str, file_path: str, force: bool = False) -> dict:
    """
    Upload `file_path` to an assignment and save the submission, as the browser does: read the edit
    page's form tokens, upload into the draft area, save. Refuses when something is already submitted
    unless `force` is set.
    """
    m = re.search(r"[?&]id=(\d+)", assign_url)
    if not m or "/mod/assign/" not in assign_url or not _is_mydy(assign_url):
        return {"status": "error", "error": "That isn't a MyDy assignment URL."}
    assign_id = m.group(1)
    view_url = f"{RAIT_URL}/mod/assign/view.php?id={assign_id}"

    current = assignment_status(session, view_url)
    if current.get("error"):
        return {"status": "error", "error": current["error"]}
    if is_submitted(current["submission_status"]) and not force:
        return {"status": "already_submitted", "submission_status": current["submission_status"]}

    resp = _get(session, f"{view_url}&action=editsubmission")
    if resp is None:
        return {"status": "error", "error": "Couldn't load the submission page."}
    soup = BeautifulSoup(resp.text, "html.parser")

    # Without a file manager on the page there is no file submission to make (closed, not open yet,
    # no permission, or file upload isn't enabled), which deserves its own answer.
    itemid_input = soup.find("input", {"name": "files_filemanager"})
    if itemid_input is None:
        return {"status": "no_submission_available", "reason": _why_no_submission(soup)}
    sesskey_input = soup.find("input", {"name": "sesskey"})
    userid_input = soup.find("input", {"name": "userid"})
    if not sesskey_input or not userid_input:
        return {"status": "error", "error": "The submission form is missing its session fields; try signing in again."}
    itemid = itemid_input["value"]
    ctx = re.search(r'"context"\s*:\s*\{[^}]*"id"\s*:\s*(\d+)', resp.text) or re.search(r'contextid["\s:]+(\d+)', resp.text)
    author = re.search(r'"author"\s*:\s*"([^"]+)"', resp.text)

    filename = os.path.basename(file_path)
    mime = mimetypes.guess_type(filename)[0] or "application/octet-stream"
    _pause()
    try:
        with open(file_path, "rb") as fh:
            upload = session.post(
                f"{RAIT_URL}/repository/repository_ajax.php",
                files={"repo_upload_file": (filename, fh, mime)},
                data={
                    "action": "upload",
                    "sesskey": sesskey_input["value"],
                    "repo_id": "4",
                    "itemid": itemid,
                    "author": author.group(1) if author else "",
                    "savepath": "/",
                    "title": filename,
                    "ctx_id": ctx.group(1) if ctx else "0",
                },
            )
    except (OSError, requests.RequestException) as e:
        return {"status": "error", "error": f"Upload failed: {e}"}
    if upload.status_code != 200:
        return {"status": "error", "error": f"Upload returned HTTP {upload.status_code}"}
    try:
        upload_json = upload.json()
    except ValueError:
        upload_json = {}
    if isinstance(upload_json, dict) and upload_json.get("error"):
        return {"status": "error", "error": f"Upload rejected: {upload_json['error']}"}

    _pause()
    try:
        session.post(
            f"{RAIT_URL}/mod/assign/view.php",
            data={
                "id": assign_id,
                "userid": userid_input["value"],
                "action": "savesubmission",
                "sesskey": sesskey_input["value"],
                "_qf__mod_assign_submission_form": "1",
                "files_filemanager": itemid,
                "submitbutton": "Save changes",
            },
        )
    except requests.RequestException as e:
        return {"status": "error", "error": f"Saving the submission failed: {e}"}

    after = assignment_status(session, view_url)
    return {"status": "submitted", "filename": filename, "submission_status": after.get("submission_status") or "unknown"}


# -- attendance drill-down and semesters ---------------------------------------------------------


def attendance_ids(soup: BeautifulSoup) -> dict[str, int]:
    """subject name -> the id its per-class attendance report uses, from the attendance block."""
    ids: dict[str, int] = {}
    table = soup.find("table", class_="generaltable")
    for row in table.find_all("tr") if table else []:
        cells = row.find_all("td")
        if len(cells) < 5:
            continue
        for cell in cells[1:4]:
            p = cell.find("p")
            if p and p.has_attr("attenid") and p["attenid"].isdigit():
                ids[cells[0].get_text(strip=True)] = int(p["attenid"])
                break
    return ids


def course_attendance(session: requests.Session, altid: int) -> list[dict] | str:
    """Every class of one subject: date, time and present/absent."""
    resp = _get(session, f"{RAIT_URL}/local/attendance/studentreport.php?id={altid}")
    if resp is None:
        return "Can't reach MyDy."
    if resp.status_code != 200:
        return f"The attendance report returned HTTP {resp.status_code}."
    soup = BeautifulSoup(resp.text, "html.parser")
    records = []
    for row in soup.select("tbody > tr"):
        cells = row.find_all("td")
        if len(cells) < 5:
            continue
        span = cells[4].find("span")
        records.append({
            "class_no": cells[0].get_text(strip=True),
            "subject": cells[1].get_text(strip=True),
            "date": cells[2].get_text(strip=True),
            "time": cells[3].get_text(strip=True),
            "status": (span or cells[4]).get_text(strip=True),
        })
    return records


def semesters(session: requests.Session) -> list[dict] | str:
    """Courses grouped by the dashboard navigation's semester labels ("Semester V", ...)."""
    resp = _get(session, f"{RAIT_URL}/my/")
    if resp is None:
        return "Can't reach MyDy."
    soup = BeautifulSoup(resp.text, "html.parser")
    out: list[dict] = []
    for li in soup.find_all("li", class_="type_course"):
        span = li.find("span", class_="usdimmed_text")
        if not span:
            continue
        label = span.get_text(strip=True)
        if not re.fullmatch(r"Semester\s+[IVX0-9]+", label, re.IGNORECASE):
            continue
        p = span.find_parent("p")
        ul = (p.find_next_sibling("ul") if p else None) or li.find("ul")
        courses = []
        for item in ul.find_all("li", recursive=False) if ul else []:
            a = item.find("a", href=True)
            if not a:
                continue
            parsed = urlparse(a["href"])
            qs = parse_qs(parsed.query)
            if "/course/view.php" in parsed.path and qs.get("id", [""])[0].isdigit():
                courses.append({"id": qs["id"][0], "name": a.get_text(strip=True)})
        if courses:
            out.append({"semester": label, "courses": courses})
    return out


# -- single-file download ------------------------------------------------------------------------


def _candidate_files(session: requests.Session, activity_url: str) -> list[tuple[str, str]] | str:
    """(url, source) pairs that might be an activity's file, most likely first."""
    if "pluginfile.php" in activity_url or urlparse(activity_url).path.lower().endswith(DIRECT_EXTS):
        return [(activity_url, "direct")]
    resp = _get(session, activity_url)
    if resp is None:
        return "Can't reach MyDy."
    if resp.status_code != 200:
        return f"The activity page returned HTTP {resp.status_code}."
    soup = BeautifulSoup(resp.text, "html.parser")
    out: list[tuple[str, str]] = []
    seen: set[str] = set()

    def add(url: str, source: str) -> None:
        url = _abs(url)
        if url not in seen:
            seen.add(url)
            out.append((url, source))

    for a in soup.find_all("a", href=True):
        if "pluginfile.php" in a["href"] or urlparse(a["href"]).path.lower().endswith(DIRECT_EXTS):
            add(a["href"], "direct")
    for url in re.findall(r"PDFFile\s*:\s*'([^']+)'", resp.text):
        add(url, "flexpaper")
    for tag, attr in (("iframe", "src"), ("object", "data"), ("embed", "src")):
        for el in soup.find_all(tag):
            if el.get(attr):
                add(el[attr], tag)
    return out


def _filename(resp: requests.Response, url: str) -> str:
    disposition = resp.headers.get("content-disposition", "")
    m = re.search(r"filename\*?=(?:UTF-8'')?\"?([^\";]+)\"?", disposition, re.IGNORECASE)
    name = unquote(m.group(1).strip()) if m else unquote(urlparse(url).path.split("/")[-1])
    name = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", name).strip(" .")
    return name or "material"


def download_file(session: requests.Session, activity_url: str, folder: str) -> dict:
    """Save one activity's file into `folder`. Tries each candidate link until one answers."""
    if not _is_mydy(activity_url):
        return {"status": "error", "error": "Only mydy.dypatil.edu URLs can be downloaded."}
    candidates = _candidate_files(session, activity_url)
    if isinstance(candidates, str):
        return {"status": "error", "error": candidates}
    if not candidates:
        return {"status": "error", "error": "No downloadable file found on this activity."}

    tried = []
    for url, source in candidates:
        if not _is_mydy(url):
            tried.append(f"{source}: not on MyDy")
            continue
        _pause()
        try:
            resp = session.get(url, stream=True)
        except requests.RequestException as e:
            tried.append(f"{source}: {e}")
            continue
        if resp.status_code != 200 or "text/html" in resp.headers.get("content-type", ""):
            tried.append(f"{source}: HTTP {resp.status_code}")
            resp.close()
            continue
        os.makedirs(folder, exist_ok=True)
        path = os.path.join(folder, _filename(resp, url))
        size = 0
        with open(path, "wb") as fh:
            for chunk in resp.iter_content(chunk_size=65536):
                fh.write(chunk)
                size += len(chunk)
        return {"status": "downloaded", "path": path, "size_bytes": size, "source": source}
    return {"status": "error", "error": "Every candidate link failed: " + "; ".join(tried)}
