export type IconName =
  | "app" | "courses" | "marked" | "unmarked" | "deadline" | "alert" | "attendance"
  | "files" | "assignments" | "grades" | "announcements" | "section" | "done"
  | "download" | "downloading" | "refresh" | "filter" | "collapsed" | "expanded" | "keys"

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
}

// Symbols every terminal font has. "" means: no icon in this mode.
const UNICODE: Record<IconName, string> = {
  app: "◆", courses: "", marked: "■", unmarked: "□", deadline: "◷", alert: "▲", attendance: "",
  files: "", assignments: "", grades: "", announcements: "", section: "▾", done: "✓",
  download: "↓", downloading: "↓", refresh: "↻", filter: "/", collapsed: "▸", expanded: "▾", keys: "",
}

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
