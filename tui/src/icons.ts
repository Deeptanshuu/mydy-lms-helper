export type IconName =
  | "app" | "courses" | "marked" | "unmarked" | "deadline" | "alert" | "attendance"
  | "files" | "assignments" | "grades" | "announcements" | "section" | "done"
  | "download" | "downloading" | "refresh" | "filter" | "collapsed" | "expanded" | "keys"
  | "overview" | "calendar" | "clock" | "account" | "trend" | "target" | "sync" | "offline" | "dot"
  | "trophy" | "bell" | "ok" | "danger" | "timer" | "semester"

// Nerd Fonts Material Design (nf-md-*) code points.
const NERD: Record<IconName, string> = {
  app: "\u{F0474}", // school
  courses: "\u{F14F7}", // book_open_variant
  marked: "\u{F0132}", // checkbox_marked
  unmarked: "\u{F0131}", // checkbox_blank_outline
  deadline: "\u{F00F0}", // calendar_clock
  alert: "\u{F0026}", // alert
  attendance: "\u{F0128}", // chart_bar
  files: "\u{F024B}", // folder
  assignments: "\u{F0A38}", // clipboard_text_outline
  grades: "\u{F04D2}", // star_outline
  announcements: "\u{F00E6}", // bullhorn
  section: "\u{F0256}", // folder_outline
  done: "\u{F012C}", // check
  download: "\u{F01DA}", // download
  downloading: "\u{F0997}", // progress_download
  refresh: "\u{F0450}", // refresh
  filter: "\u{F0349}", // magnify
  collapsed: "\u{F0142}", // chevron_right
  expanded: "\u{F0140}", // chevron_down
  keys: "\u{F030C}", // keyboard
  overview: "\u{F0A1D}", // view_dashboard_outline
  calendar: "\u{F00ED}", // calendar
  clock: "\u{F0150}", // clock_outline
  account: "\u{F0009}", // account_circle
  trend: "\u{F0535}", // trending_up
  target: "\u{F04FE}", // target
  sync: "\u{F04E6}", // sync
  offline: "\u{F05AA}", // wifi_off
  dot: "\u{F09DE}", // circle_medium
  trophy: "\u{F053A}", // trophy_outline
  bell: "\u{F009C}", // bell_outline
  ok: "\u{F05E0}", // check_circle
  danger: "\u{F0028}", // alert_circle
  timer: "\u{F051F}", // timer_sand
  semester: "\u{F1180}", // school_outline
}

// Symbols every terminal font has. "" means: no icon in this mode.
// Only characters from WGL4 (the Windows Glyph List that Consolas, Lucida Console and Courier New cover, and
// so do Menlo, Cascadia Mono, DejaVu Sans Mono and Liberation Mono): ASCII, Latin-1 punctuation, the arrows
// ↑↓↔↕, ■□▪▲►▼◄◊○●, √ × · • …. Not ◆ ◈ ◎ ▸ ▾ ◷ ↻ ↗ ✓ ✕: fonts like Liberation Mono and Consolas lack them and
// draw a box. Keep every fallback one cell wide, and no emoji (test/fonts.test.ts checks all of this).
const UNICODE: Record<IconName, string> = {
  app: "♦", courses: "", marked: "■", unmarked: "□", deadline: "○", alert: "▲", attendance: "",
  files: "", assignments: "", grades: "", announcements: "", section: "▼", done: "√",
  download: "↓", downloading: "↓", refresh: "↕", filter: "/", collapsed: "►", expanded: "▼", keys: "",
  overview: "◊", calendar: "", clock: "○", account: "", trend: "↑", target: "○", sync: "↕", offline: "×", dot: "●",
  trophy: "", bell: "", ok: "√", danger: "!", timer: "○", semester: "",
}

/** Every icon name, so tests cover icons added later without listing them again. */
export const ICON_NAMES = Object.keys(NERD) as IconName[]

export function glyph(name: IconName, nerd: boolean): string {
  return (nerd ? NERD : UNICODE)[name]
}

/** Icon plus two spaces (a 3-cell slot), or "" when this mode has no icon. */
export function slot(name: IconName, nerd: boolean): string {
  const g = glyph(name, nerd)
  return g ? `${g}  ` : ""
}

export type FileKind = "pdf" | "ppt" | "doc" | "file"

const FILE_NERD: Record<FileKind, string> = {
  pdf: "\u{F0226}", // file_pdf_box
  ppt: "\u{F0228}", // file_powerpoint_box
  doc: "\u{F09EE}", // file_document_outline
  file: "\u{F0224}", // file_outline
}

/** 3 cells with a Nerd Font, 5 cells ("pdf  ", "file ") without. */
export function fileSlot(kind: FileKind, nerd: boolean): string {
  return nerd ? `${FILE_NERD[kind]}  ` : kind.padEnd(4) + " "
}

// Powerline "extra" half circles: rounded ends for pills. Only drawn with a Nerd Font.
export const CAP_LEFT = "\u{E0B6}"
export const CAP_RIGHT = "\u{E0B4}"
