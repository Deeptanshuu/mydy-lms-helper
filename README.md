# MyDy LMS Helper

This script automates the process of logging into the Moodle LMS (Moodle-based) and downloading all available course materials (PDFs, PPTs, etc.) from your enrolled courses.

## Features
- **Interactive Course Selection**: Choose specific courses or download from all courses
- **Automatic Login**: Handles the two-step authentication process
- **Smart File Detection**: Finds and downloads files from various activity types:
  - Direct file resources (PDFs, PPTs, DOCX)
  - FlexPaper presentations
  - Presentation modules
  - Case studies and question modules
- **Progress Tracking**: Real-time progress bars for downloads and processing
- **Rate Limiting**: Built-in delays to avoid overwhelming the server
- **Duplicate Detection**: Skips files that already exist with the same size
- **URL Decoding**: Handles URL-encoded filenames properly
- **Comprehensive Reporting**: Detailed summary of downloaded files and any failures
- **Previous Semester Support**: Can download materials from previous semester courses

## Proof

<img width="1906" height="994" alt="Screenshot 2025-09-19 000702" src="https://github.com/user-attachments/assets/c241827c-c2f0-4e7e-98d6-20a13fb4cf4a" />
<img width="1886" height="997" alt="Screenshot 2025-09-19 000803" src="https://github.com/user-attachments/assets/b2b19e50-4529-40a3-803b-0968641da54c" />
<img width="1902" height="935" alt="Screenshot 2025-09-19 000822" src="https://github.com/user-attachments/assets/17e5f034-43e9-4972-8dad-e970fba92879" />

## Setup

### 1. Clone or Download
Place `scraper.py` and this `README.md` in a folder of your choice.

### 2. Install Dependencies
Create a virtual environment (optional but recommended):
```sh
python -m venv venv
venv\Scripts\activate  # On Windows
# or
source venv/bin/activate  # On Linux/Mac
```

Install required packages:
```sh
pip install -r requirements.txt
```

Or install manually:
```sh
pip install requests beautifulsoup4 python-dotenv tqdm
```

### 3. Configure Environment Variables
Create a `.env` file in the same directory as `scraper.py` with the following content:
```
MYDY_USERNAME="your_lms_email@dypatil.edu"
MYDY_PASSWORD="your_lms_password"
```
**Important: Do not use `USERNAME` as the variable name on Windows - it's reserved by the system!**

### 4. Run the Script
```sh
python scraper.py
```

The script will:
1. Log you into the LMS
2. Fetch your available courses
3. Display an interactive menu to select courses
4. Download all materials from selected courses with progress tracking

## How It Works

### Authentication Process
The script handles Moodle's two-step login:
1. Submits username to get redirected to Moodle login
2. Submits password to complete authentication
3. Maintains session for subsequent requests

### Course Discovery
- Scans dashboard for enrolled courses
- Includes both current and previous semester courses
- Displays courses sorted by course ID (newest first)

### File Detection & Download
The scraper identifies downloadable content from various Moodle activity types:
- **Resource modules**: Direct file downloads
- **FlexPaper modules**: Extracts PDF URLs from JavaScript
- **Presentation modules**: PowerPoint and other presentation files
- **Object/Iframe content**: Files embedded in various formats

### Organization
- Creates separate folders for each course
- Uses sanitized course names for folder creation
- Preserves original filenames with proper URL decoding

## Usage Examples

### Download All Courses
```
Select course to download (1-X): [number for "Download ALL courses"]
```

### Download Specific Course
```
Select course to download (1-X): [specific course number]
```

### Sample Output
```
🎓 Courses processed: 3
✅ Total files downloaded: 45
⚠️  Total failed activities: 2
⏱️  Total download time: 67.23s

📁 Course breakdown:
  📁 Data Structures and Algorithms: 18 files
  📁 Computer Networks: 15 files  
  📁 Database Management Systems: 12 files
```

## Troubleshooting

### Login Issues
- **"Login failed!"**: Double-check your `.env` file credentials
- **Username shows as Windows username**: You're using `USERNAME` instead of `MYDY_USERNAME`
- **Timeout errors**: The server might be slow; try running again

### Download Issues
- **No files downloaded**: Course might have no downloadable content or you might not be enrolled
- **Some activities failed**: Normal - not all activities contain downloadable files
- **Connection errors**: Check your internet connection and try again

### File Issues
- **Duplicate files**: The script automatically skips existing files of the same size
- **Invalid filenames**: Script automatically sanitizes folder names for your OS
- **Permission errors**: Make sure you have write access to the script directory

## Security & Privacy
- Credentials are stored in `.env` file and never hardcoded
- Session cookies are temporary and only stored in memory
- Always add `.env` to your `.gitignore` if using version control
- The script respects rate limits to avoid overwhelming the server

## Rate Limiting
The script includes built-in rate limiting:
- 0.5-2.0 second delays between requests
- Additional delays for file downloads
- Random intervals to appear more human-like

## Customization

### Modify Rate Limits
Edit the `__init__` method in `MydyScraper` class:
```python
self.min_delay = 0.5  # Minimum delay
self.max_delay = 2.0  # Maximum delay
self.download_delay = 0.3  # Additional delay for downloads
```

### Add New Activity Types
Add new patterns to the `activity_types` list in `download_course` method:
```python
activity_types = [
    '/mod/resource/view.php',
    '/mod/flexpaper/view.php',
    # Add new activity types here
]
```

## Requirements
- Python 3.6+
- Internet connection
- Valid LMS account
- Access to courses you want to download

## License
MIT License. Use at your own risk.

## Disclaimer
This tool is for educational purposes only. Respect your institution's terms of service and use responsibly. Only download content you have legitimate access to.
