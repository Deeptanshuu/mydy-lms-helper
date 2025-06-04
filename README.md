# MyDY Moodle Downloader - Browser Extension

A Chrome browser extension that automatically downloads course materials from the MyDY Moodle portal (mydy.dypatil.edu).

## Features

- 🔐 Secure login handling (credentials are never stored)
- 📚 Automatic course detection from dashboard
- ✅ Batch download of all course materials
- 📁 Organized file downloads by course
- 🎯 Support for various file types (PDFs, PPTs, Documents)
- ⚡ Progress tracking with real-time updates
- 🛡️ Rate limiting to avoid server overload

## Supported File Types

- Direct file links (PDFs, PowerPoints, Documents)
- FlexPaper embedded PDFs
- Presentation modules
- Case study materials
- DY Question modules

## Installation

1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the extension folder
5. The extension will appear in your browser toolbar

## Usage

1. **Navigate to MyDY**: Go to https://mydy.dypatil.edu
2. **Open Extension**: Click the extension icon in your toolbar
3. **Login**: Enter your Moodle username and password
4. **Select Courses**: Choose specific courses or download all
5. **Download**: Files will be automatically downloaded to your default download folder

## How It Works

The extension consists of several components:

- **Popup Interface**: User-friendly interface for login and course selection
- **Content Script**: Runs on MyDY pages to handle login and scraping
- **Background Script**: Manages file downloads using Chrome's download API
- **Rate Limiting**: Prevents overwhelming the server with requests

## Security & Privacy

- ✅ Credentials are only used for the current session
- ✅ No data is stored permanently
- ✅ All communication is encrypted (HTTPS)
- ✅ Respects server rate limits
- ✅ No tracking or analytics

## File Organization

Downloaded files maintain the original names and are organized by course. Files are saved to your browser's default download location.

## Troubleshooting

### Login Issues
- Ensure you're using correct Moodle credentials
- Try refreshing the MyDY page before using the extension
- Check if you can log in manually first

### No Courses Found
- This is normal between semesters
- Make sure you're enrolled in courses
- Previous semester courses should still be accessible

## Technical Details

- **Manifest Version**: 3 (latest Chrome extension format)
- **Permissions**: Limited to MyDY domain and downloads
- **File Types**: Supports all common educational file formats
- **Browser**: Chrome/Chromium-based browsers

## Contributing

Feel free to submit issues or pull requests to improve the extension.

## Disclaimer

This extension is for educational purposes only. Users are responsible for complying with their institution's terms of service and copyright policies.

## Version History

- **v1.0.0**: Initial release with basic download functionality