<div align="center">

<img src="icons/logo.png" alt="" width="96">

# MyDy Downloader

Every course's files from MyDy in one go, sorted into a folder per course.

[![Extension release](https://img.shields.io/github/v/release/Deeptanshuu/mydy-lms-helper?filter=ext-v*&label=extension&style=flat-square&color=FF6500)](https://github.com/Deeptanshuu/mydy-lms-helper/releases)
[![Chrome MV3](https://img.shields.io/badge/chrome-manifest%20v3-17191B?style=flat-square&logo=googlechrome&logoColor=white)](manifest.json)
[![Part of MyDy LMS Helper](https://img.shields.io/badge/part%20of-MyDy%20LMS%20Helper-17191B?style=flat-square)](../README.md)

</div>

<br>

<table>
<tr>
<td width="33%"><img alt="Pick courses: filter, tick the ones you want, download" src="../docs/assets/extension-courses.png"></td>
<td width="33%"><img alt="Downloading: overall progress, the current file, and each course's status" src="../docs/assets/extension-progress.png"></td>
<td width="33%"><img alt="Finished: files per course, with anything that failed flagged" src="../docs/assets/extension-done.png"></td>
</tr>
</table>

Part of [MyDy LMS Helper](../README.md). For attendance, grades and assignments too, use the [terminal UI](../tui/README.md).

Downloads resources, FlexPaper PDFs, presentations, case studies and DY Question modules into `Downloads/MyDy/<course>/`. It uses your signed-in browser session, never sees your password, and only talks to `mydy.dypatil.edu`. It's gentle on MyDy (one request at a time, each file fetched once), skips files you already have, and keeps showing progress if you close and reopen the popup.

## Install

1. Download the latest `ext-v*` zip from [Releases](https://github.com/Deeptanshuu/mydy-lms-helper/releases) and extract it (or use this folder).
2. Open `chrome://extensions/`, turn on **Developer mode**, click **Load unpacked** and pick the folder.
3. Open [mydy.dypatil.edu](https://mydy.dypatil.edu), sign in, click the extension icon, choose courses and download.

No courses showing? That's normal between semesters. Otherwise refresh the MyDy tab and reopen the extension.

## Development

```sh
cd extension
npm install
npm run build:webstore   # builds dist/ and a Chrome Web Store zip
npm run version:patch    # bumps package.json and manifest.json together
npm run screenshots      # re-renders the README screenshots with headless Chrome
```

Releases are built by [`.github/workflows/extension.yml`](../.github/workflows/extension.yml) when an `ext-v*` tag is pushed.

## Disclaimer

Unofficial, for educational use. Follow your institution's terms of service.
