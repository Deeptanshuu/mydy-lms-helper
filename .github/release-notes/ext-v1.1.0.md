The popup is redesigned to match the terminal app, downloads are much gentler on MyDy, and progress survives closing the popup.

## Highlights

- **New popup.** Same look as the terminal app.
- **One folder per course.** Files are saved to `Downloads/MyDy/<course>/`, keeping the file names MyDy gives them.
- **Real progress.** Overall progress, the current file, and the status of each course while downloading.
- **Results per course.** When it finishes you see the files each course saved, and anything that failed is flagged.
- **Gentle on MyDy.** One request at a time, spaced out, like the terminal app. Course and activity pages are read without loading their scripts and images, each file is downloaded once, and downloads never overlap.
- **Skips what you have.** Files you downloaded before and still have aren't fetched again.
- **Progress survives closing the popup.** Reopen it mid-download to see where it is, or afterwards to see the results. The toolbar icon shows the progress too.
- **Remembers your selection.** The courses you ticked are still ticked next time.
- **Filter and keyboard.** Press `/` to filter courses, use the arrow keys to move, and `space` or `enter` to tick.

## Fixes

- Progress text no longer shows up blank during a download.
- Courses you had selected are no longer dropped when you filter the list.
- Course names are shown as plain text.
- Listing courses no longer navigates away from the page you're on.

## Install

1. Download `mydy-extension-v1.1.0.zip` from the assets below and extract it.
2. Open `chrome://extensions/` and turn on **Developer mode**.
3. Click **Load unpacked** and select the extracted folder.
4. Open [mydy.dypatil.edu](https://mydy.dypatil.edu), sign in, click the extension icon, choose courses and download.

## Notes

- It downloads resources, FlexPaper PDFs, presentations, case studies and DY Question modules.
- It uses your signed-in browser session and only talks to `mydy.dypatil.edu`. It never sees your password.
- Closing or reloading the MyDy tab stops a download; the popup says so. If a different file with the same name is already in the folder, Chrome adds a number to the new one's name.
- No courses showing is normal between semesters. Otherwise refresh the MyDy tab and reopen the extension.
- For attendance, grades and assignments, use the [terminal app](https://github.com/Deeptanshuu/mydy-lms-helper/blob/main/tui/README.md).

Unofficial and not affiliated with D.Y. Patil or MyDy.
