export interface Course {
  id: string
  name: string
  url: string
}

export interface AttendanceSubject {
  subject: string
  total: number
  present: number
  absent: number
  /** Percentage as MyDy reports it, or null if it wasn't a number. */
  percentage: number | null
}

export interface Attendance {
  batch: string | null
  semester: string | null
  subjects: AttendanceSubject[]
}

export interface Activity {
  name: string
  /** Moodle module type from the `modtype_<type>` class, e.g. "resource", "assign". */
  type: string
  url: string
}

export interface Section {
  number: number | null
  name: string
  activities: Activity[]
}

export interface Assignment {
  name: string
  url: string
  dueText: string | null
  due: Date | null
  submissionStatus: string | null
  gradingStatus: string | null
  grade: string | null
  timeRemaining: string | null
  submitted: boolean
}

export interface GradeItem {
  name: string
  grade: string | null
  range: string | null
  percentage: string | null
  feedback: string | null
}

export interface GradeReport {
  courseName: string
  items: GradeItem[]
  total: GradeItem | null
}

export interface AnnouncementSummary {
  title: string
  url: string
  author: string | null
  dateText: string | null
}

export interface Announcement extends AnnouncementSummary {
  content: string | null
}

export type FileSource = "direct" | "flexpaper" | "presentation" | "iframe" | "object"

export interface FileRef {
  url: string
  filename: string
  source: FileSource
}

export interface LoginResult {
  maskedUser: string
}

// ── UniClaIRE (the university results portal) ──────────────────────────────────────────────────

/** "legacy": O A B C D E P F. "new" (DY24 batches on): O A+ A B+ B C P F. */
export type GradeScheme = "legacy" | "new"

export interface ResultCourse {
  name: string
  /** Theory / practical, as the portal labels it. */
  type: string
  credits: number
  /** The grade as printed: "A+", "O", "F", "AB"... */
  grade: string
  /** Grade points, or null when the grade isn't one the scheme knows (not out yet, audit courses). */
  points: number | null
  internal: string
  external: string
  total: string
}

export interface ResultSemester {
  /** 1, 2, 3... in exam order. */
  term: number
  exam: string
  code: string
  sgpa: number | null
  credits: number
  courses: ResultCourse[]
}

export interface Results {
  usn: string
  scheme: GradeScheme
  cgpa: number | null
  credits: number
  semesters: ResultSemester[]
}

export interface RevaluationExam {
  code: string
  exam: string
  examDate: string
  resultDate: string
  /** The revaluation / re-totalling / photocopy window is open now. */
  open: boolean
  window: string
}

/** One subject on a revaluation / re-totalling / photocopy application. */
export interface RevaluationItem {
  code: string
  subject: string
  exam: string
  examDate: string
  /** What was asked for: "Revaluation", "Re-totalling", "Photocopy"... */
  kind: string
  processed: boolean
}

export interface RevaluationApplication {
  appNo: string
  applied: string
  amount: string
  paid: string
  paymentType: string
  status: string
  /** Per-subject progress; null when it couldn't be fetched. */
  items: RevaluationItem[] | null
}
