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

Part of [MyDy LMS Helper](../README.md). For attendance, grades and assignments as well as downloads, use the [terminal UI](../README.md#terminal-ui).

## Features

- Finds your courses from the MyDy dashboard
- Downloads every course's files in one go, or just the courses you pick
- Groups downloads by course
- Shows progress as files come in
- Spaces out requests so it doesn't hammer the server
- Uses your credentials only for the current session and never stores them

## What it can download

- Direct file links (PDFs, PowerPoints, documents)
- FlexPaper embedded PDFs
- Presentation modules
- Case study materials
- DY Question modules

## Install

1. Download the latest `ext-v*` zip from [Releases](https://github.com/Deeptanshuu/mydy-lms-helper/releases) and extract it, or clone [mydy-lms-helper](https://github.com/Deeptanshuu/mydy-lms-helper).
2. Open `chrome://extensions/` and turn on **Developer mode** (top right).
3. Click **Load unpacked** and pick the extracted folder, or the `extension/` folder of your clone.
4. The extension appears in your toolbar.

## Use

1. Go to [mydy.dypatil.edu](https://mydy.dypatil.edu).
2. Click the extension icon.
3. Sign in to MyDy in that tab if you aren't already; the extension uses your browser session.
4. Choose courses, or select all.
5. Click download. Files are saved to your browser's download folder.

## How it works

| Part | File | Job |
|---|---|---|
| Popup | `popup.html`, `js/popup.js` | Sign-in check and course selection |
| Content script | `js/content.js` | Runs on MyDy pages, finds courses and their files |
| Service worker | `js/background.js` | Saves files with Chrome's downloads API |

It only asks for access to `mydy.dypatil.edu` plus the downloads, storage, cookies and active-tab permissions. It has no analytics or tracking, and everything goes over HTTPS.

## Troubleshooting

**Login fails**
- Check that you can log in to MyDy normally first.
- Refresh the MyDy page, then open the extension again.

**No courses found**
- This is expected between semesters.
- Make sure you're enrolled in courses. Previous semesters' courses should still show up.

## Development

```sh
cd extension
npm install
npm run build:webstore   # builds dist/ and a Chrome Web Store zip
npm run version:patch    # bumps package.json and manifest.json together
```

Releases are built by [`.github/workflows/extension.yml`](../.github/workflows/extension.yml) when an `ext-v*` tag is pushed.

## Disclaimer

For educational use only. You're responsible for following your institution's terms of service and copyright policies.
