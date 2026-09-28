// Nerd Font nf-md glyphs are Material Design Icons: this maps each icon the UI uses to its MDI name,
// so the screenshot, website and preview generators can draw real vector icons instead of glyphs.
import type * as mdi from "@mdi/js"
import type { FileKind, IconName } from "../src/icons"

export const MDI_NAME: Record<IconName, keyof typeof mdi> = {
  app: "mdiSchool", courses: "mdiBookOpenVariant", marked: "mdiCheckboxMarked", unmarked: "mdiCheckboxBlankOutline",
  deadline: "mdiCalendarClock", alert: "mdiAlert", attendance: "mdiChartBar", files: "mdiFolder",
  assignments: "mdiClipboardTextOutline", grades: "mdiStarOutline", announcements: "mdiBullhorn", section: "mdiFolderOutline",
  done: "mdiCheck", download: "mdiDownload", downloading: "mdiProgressDownload", refresh: "mdiRefresh", filter: "mdiMagnify",
  collapsed: "mdiChevronRight", expanded: "mdiChevronDown", keys: "mdiKeyboard",
  overview: "mdiViewDashboardOutline", calendar: "mdiCalendar", clock: "mdiClockOutline", account: "mdiAccountCircle",
  trend: "mdiTrendingUp", target: "mdiTarget", sync: "mdiSync", offline: "mdiWifiOff", dot: "mdiCircleMedium",
  trophy: "mdiTrophyOutline", bell: "mdiBellOutline", ok: "mdiCheckCircle", danger: "mdiAlertCircle", timer: "mdiTimerSand",
  semester: "mdiSchoolOutline",
}

export const MDI_FILE: Record<FileKind, keyof typeof mdi> = {
  pdf: "mdiFilePdfBox", ppt: "mdiFilePowerpointBox", doc: "mdiFileDocumentOutline", file: "mdiFileOutline",
}
