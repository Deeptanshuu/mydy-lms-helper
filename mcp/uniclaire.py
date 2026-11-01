"""
UniClaIRE student portal (studentportal.universitysolutions.in): results, SGPA/CGPA and revaluation.

A separate sign-in from MyDy: the portal takes the registration number (often the student's mobile
number) and its own password. The USN, the university roll number like DY23..., is read from the
profile after signing in. Every function signs in afresh; the portal's sessions are short-lived.

Errors are raised as ValueError with a message meant for the user.
"""

from __future__ import annotations

import re
import time

import requests

PORTAL_URL = "https://studentportal.universitysolutions.in"
# D.Y. Patil's university code on the portal's app.php endpoints.
UNIV_CODE = "051"
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36"
)

# Grade letters to grade points. Batches from DY24 on use the newer scale.
LEGACY_POINTS = {"O": 10, "A": 9, "B": 8, "C": 7, "D": 6, "E": 5, "P": 4, "F": 0, "AB": 0}
NEW_POINTS = {"O": 10, "A+": 9, "A": 8, "B+": 7, "B": 6, "C": 5, "P": 4, "F": 0, "AB": 0}
VALID_POINTS = {10, 9, 8, 7, 6, 5, 4, 0}

# Exam codes look like "A-2023-1": term letter, year, attempt.
_EXAM_CODE = re.compile(r"^([A-Za-z])-(\d{4})-(\d+)$")


def grade_scheme(usn: str) -> str:
    m = re.match(r"^DY(\d{2})", usn, re.IGNORECASE)
    return "new" if m and int(m.group(1)) >= 24 else "legacy"


def grade_points(raw: str, scheme: str) -> int | None:
    """Points for a grade as the portal prints it (a letter or a number), or None if it isn't one."""
    text = raw.strip().upper()
    table = NEW_POINTS if scheme == "new" else LEGACY_POINTS
    if text in table:
        return table[text]
    try:
        n = round(float(text))
    except ValueError:
        return None
    return n if n in VALID_POINTS else None


def latest_exams(rows: list[dict]) -> list[dict]:
    """
    One exam per term letter: the latest year, then the highest attempt, so an ATKT re-attempt
    replaces the original sitting. Codes of another shape are kept as they are. Sorted by term.
    """
    by_term: dict[str, dict] = {}
    for r in rows:
        code = str(r.get("year", ""))
        m = _EXAM_CODE.match(code)
        entry = {"code": code, "name": str(r.get("examname", ""))}
        if not m:
            by_term[code] = {**entry, "year": "", "attempt": 0}
            continue
        term, year, attempt = m.group(1), m.group(2), int(m.group(3))
        prev = by_term.get(term)
        if not prev or (year, attempt) > (prev["year"], prev["attempt"]):
            by_term[term] = {**entry, "year": year, "attempt": attempt}
    return [{"code": e["code"], "name": e["name"]} for _, e in sorted(by_term.items())]


def weighted_gpa(courses: list[dict]) -> float | None:
    """Credit-weighted mean of grade points, two decimals; None with no graded credits."""
    points = credits = 0.0
    for c in courses:
        if c.get("points") is None:
            continue
        try:
            cr = float(c.get("credits") or 0)
        except ValueError:
            continue
        points += cr * c["points"]
        credits += cr
    return round(points / credits, 2) if credits else None


class _Portal:
    def __init__(self, regno: str, password: str):
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": USER_AGENT, "X-Requested-With": "XMLHttpRequest", "Accept": "*/*"})
        self.usn = ""
        self._sign_in(regno, password)

    def _json(self, method: str, path: str, **kwargs) -> dict:
        try:
            resp = self.session.request(method, f"{PORTAL_URL}{path}", timeout=20, **kwargs)
        except requests.RequestException as e:
            raise ValueError(f"Can't reach the UniClaIRE portal: {e}") from e
        try:
            data = resp.json()
        except ValueError as e:
            raise ValueError(f"The UniClaIRE portal sent an unexpected reply from {path} (HTTP {resp.status_code}).") from e
        return data if isinstance(data, dict) else {"data": data}

    def _sign_in(self, regno: str, password: str) -> None:
        try:
            self.session.get(PORTAL_URL, timeout=15)
        except requests.RequestException as e:
            raise ValueError(f"Can't reach the UniClaIRE portal: {e}") from e
        # The portal's "captcha" is a value it hands out and then expects back.
        captcha = self._json("GET", "/get_captcha.php").get("captcha", "")
        try:
            resp = self.session.post(
                f"{PORTAL_URL}/signin.php",
                data={"regno": regno, "passwd": password, "captcha": captcha},
                headers={"Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"},
                timeout=20,
            )
        except requests.RequestException as e:
            raise ValueError(f"Can't reach the UniClaIRE portal: {e}") from e
        ok = resp.status_code < 400
        message = ""
        try:
            j = resp.json()
            if "error_code" in j:
                ok = str(j["error_code"]) == "0"
            message = j.get("msg", "")
        except ValueError:
            if re.search(r"invalid|incorrect|failed|wrong", resp.text, re.IGNORECASE):
                ok = False
        if not ok:
            raise ValueError(message or "UniClaIRE rejected the registration number or password.")

        profile = self._json("POST", "/src/profile.php")
        self.usn = str(profile.get("strRegno") or profile.get("fregno") or profile.get("FREGNO") or profile.get("regno") or "").strip()
        if not self.usn:
            raise ValueError("Signed in to UniClaIRE, but couldn't read the USN from the profile.")

    def get(self, path: str, **params) -> dict:
        return self._json("GET", path, params={**params, "_": int(time.time() * 1000)})


def sign_in(regno: str, password: str) -> str:
    """Check a login; returns the USN."""
    return _Portal(regno, password).usn


def fetch_results(regno: str, password: str) -> dict:
    """
    Every term's results with SGPA, and the CGPA over all of them. A subject that appears in several
    exams (a re-attempt) only counts in the latest one.

    {"usn", "scheme", "cgpa", "credits", "semesters": [{"term", "exam", "code", "sgpa", "credits",
     "courses": [{"name", "type", "credits", "grade", "points", "internal", "external", "total"}]}]}
    """
    portal = _Portal(regno, password)
    scheme = grade_scheme(portal.usn)
    exams = latest_exams(portal.get("/src/results_new.php", a="getResAll").get("data") or [])

    sittings = []
    for exam in exams:
        body = portal.get("/src/results_new.php", a="getResults", examno=exam["code"], regno=portal.usn).get("body") or []
        courses = []
        for c in body:
            name = str(c.get("subject") or "").strip()
            if not name:
                continue
            grade = str(c.get("remarks") or "").strip()
            courses.append({
                "name": name,
                "type": str(c.get("mthprue") or "").strip(),
                "credits": str(c.get("FCREDITS") or "").strip(),
                "grade": grade,
                "points": grade_points(grade, scheme),
                "internal": str(c.get("ia_exam") or "").strip(),
                "external": str(c.get("uni_exam") or "").strip(),
                "total": str(c.get("thtot") or "").strip(),
            })
        sittings.append((exam, courses))

    key = lambda name: re.sub(r"\s+", " ", name.lower())  # noqa: E731
    latest: dict[str, int] = {}
    for i, (_, courses) in enumerate(sittings):
        for c in courses:
            latest[key(c["name"])] = i

    semesters = []
    every: list[dict] = []
    for i, (exam, courses) in enumerate(sittings):
        kept = [c for c in courses if latest[key(c["name"])] == i]
        if not kept:
            continue
        every += kept
        semesters.append({
            "term": len(semesters) + 1,
            "exam": exam["name"],
            "code": exam["code"],
            "sgpa": weighted_gpa(kept),
            "credits": _credits(kept),
            "courses": kept,
        })
    return {"usn": portal.usn, "scheme": scheme, "cgpa": weighted_gpa(every), "credits": _credits(every), "semesters": semesters}


def grade_letters(scheme: str) -> list[str]:
    """The grades of a scheme, best first."""
    return ["O", "A+", "A", "B+", "B", "C", "P", "F"] if scheme == "new" else ["O", "A", "B", "C", "D", "E", "P", "F"]


def simulate(results: dict, changes: dict[str, str]) -> dict:
    """
    What-if: `results` (from fetch_results) with some subjects' grades replaced, SGPA and CGPA worked
    out again. `changes` maps subject name (case and spacing ignored) to a hypothetical grade.
    """
    letters = grade_letters(results["scheme"])
    wanted = {re.sub(r"\s+", " ", k.strip().lower()): v.strip().upper() for k, v in changes.items()}
    bad = {name: grade for name, grade in wanted.items() if grade not in letters}
    if bad:
        raise ValueError(f"Not a grade in this scheme ({', '.join(letters)}): " + ", ".join(f"{n} -> {g}" for n, g in bad.items()))

    applied: list[dict] = []
    semesters = []
    every: list[dict] = []
    for sem in results["semesters"]:
        courses = []
        for c in sem["courses"]:
            grade = wanted.get(re.sub(r"\s+", " ", c["name"].strip().lower()))
            if grade is not None and grade != c["grade"].strip().upper():
                applied.append({"subject": c["name"], "term": sem["term"], "from": c["grade"], "to": grade})
                c = {**c, "grade": grade, "points": grade_points(grade, results["scheme"])}
            courses.append(c)
        every += courses
        semesters.append({"term": sem["term"], "exam": sem["exam"], "sgpa": sem["sgpa"], "simulated_sgpa": weighted_gpa(courses)})

    names = {re.sub(r"\s+", " ", c["name"].strip().lower()) for sem in results["semesters"] for c in sem["courses"]}
    return {
        "usn": results["usn"],
        "cgpa": results["cgpa"],
        "simulated_cgpa": weighted_gpa(every),
        "changes": applied,
        "not_found": [n for n in wanted if n not in names],
        "semesters": [s for s in semesters if s["sgpa"] != s["simulated_sgpa"]],
        "grades": letters,
    }


def _credits(courses: list[dict]) -> float:
    total = 0.0
    for c in courses:
        try:
            total += float(c.get("credits") or 0)
        except ValueError:
            pass
    return total


def revaluation_windows(regno: str, password: str) -> dict:
    """Each exam and whether its revaluation / re-totalling / photocopy window is open now."""
    portal = _Portal(regno, password)
    rows = portal.get("/src/results_new.php", a="getRvAll").get("data") or []
    return {
        "usn": portal.usn,
        "exams": [
            {
                "code": str(r.get("year", "")),
                "exam": str(r.get("examname", "")),
                "exam_date": str(r.get("examdate", "")),
                "result_date": str(r.get("resultdate", "")),
                "open": str(r.get("rvenable", "0")) == "1",
                "window": re.sub(r"<br\s*/?>", " | ", str(r.get("rvdates", ""))).strip(),
            }
            for r in rows
        ],
    }


def revaluation_applications(regno: str, password: str) -> dict:
    """The student's revaluation / re-totalling / photocopy applications."""
    portal = _Portal(regno, password)
    rows = portal.get("/src/yourAppsRVRT.php", a="getYourAppsRVRT", regno=portal.usn).get("tableData") or []
    return {
        "usn": portal.usn,
        "applications": [
            {
                "app_no": str(r.get("APPNO", "")),
                "applied": str(r.get("FAPPDATE", "")),
                "amount": str(r.get("FTOTAL", "")),
                "paid": str(r.get("FACKDATE", "")),
                "payment_type": str(r.get("FPAYMENTTYPE", "")),
                "status": str(r.get("status", "")),
            }
            for r in rows
        ],
    }


def revaluation_status(regno: str, password: str, app_no: str) -> dict:
    """Per-subject progress of one application."""
    portal = _Portal(regno, password)
    rows = portal._json(
        "POST",
        "/src/rvappstatus.php",
        data={"app_no": app_no},
        headers={"Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"},
    ).get("data") or []
    return {
        "usn": portal.usn,
        "app_no": str(app_no),
        "items": [
            {
                "code": str(r.get("fsubcode", "")),
                "subject": str(r.get("fsubname", "")).strip(),
                "exam": str(r.get("fexamname", "")),
                "exam_date": str(r.get("fexamdate", "")),
                "kind": str(r.get("fcorrdescpn", "")) or str(r.get("fcorrtype", "")),
                "processed": str(r.get("frvstatus", "")) == "T",
            }
            for r in rows
        ],
    }


def revaluation_pdf(regno: str, password: str, app_no: str) -> bytes:
    """The printable application form, as PDF bytes."""
    portal = _Portal(regno, password)
    try:
        resp = portal.session.get(
            f"{PORTAL_URL}/app.php",
            params={"a": "PrintRevaluationApplicationForm", "app_no": app_no, "univcode": UNIV_CODE},
            timeout=30,
        )
    except requests.RequestException as e:
        raise ValueError(f"Can't reach the UniClaIRE portal: {e}") from e
    if not resp.content.startswith(b"%PDF"):
        raise ValueError("The portal didn't return a PDF. Check the application number.")
    return resp.content
