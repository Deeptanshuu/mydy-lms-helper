<div align="center">

<img src="icons/logo.png" alt="" width="96">

# MyDY Moodle Downloader

Download your course files from the MyDy portal (mydy.dypatil.edu) in a couple of clicks.

[![Extension release](https://img.shields.io/github/v/release/Deeptanshuu/mydy-lms-helper?filter=ext-v*&label=extension&style=flat-square&color=FF6500)](https://github.com/Deeptanshuu/mydy-lms-helper/releases)
[![Chrome MV3](https://img.shields.io/badge/chrome-manifest%20v3-17191B?style=flat-square&logo=googlechrome&logoColor=white)](manifest.json)
[![Part of MyDy LMS Helper](https://img.shields.io/badge/part%20of-MyDy%20LMS%20Helper-17191B?style=flat-square)](../README.md)

</div>

<br>

<table>
<tr>
<td width="50%"><img alt="Extension popup" src="https://github.com/user-attachments/assets/6ae0af24-a82a-4e29-b3a4-57cd27b05fda"></td>
<td width="50%"><img alt="Extension popup" src="https://github.com/user-attachments/assets/5f18fec2-d637-469a-9011-c7675c9a9c81"></td>
</tr>
</table>

Part of [MyDy LMS Helper](../README.md). For attendance, grades and assignments too, use the [terminal UI](../tui/README.md).

Downloads resources, FlexPaper PDFs, presentations, case studies and DY Question modules, grouped by course. It uses your logged-in browser session, never stores your password, and only talks to `mydy.dypatil.edu`.

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
```

Releases are built by [`.github/workflows/extension.yml`](../.github/workflows/extension.yml) when an `ext-v*` tag is pushed.

## Disclaimer

Unofficial, for educational use. Follow your institution's terms of service.
