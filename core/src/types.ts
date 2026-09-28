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
