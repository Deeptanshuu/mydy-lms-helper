# DY Patil LMS Scraper

This script (`scraper.py`) automates the process of logging into the DY Patil LMS (Moodle-based) and downloading all available course materials (PDFs, PPTs, etc.) from a specified course page.

## Features
- Logs in using your LMS credentials
- Finds and downloads all files from course activities (resources, presentations, FlexPaper, etc.)
- Handles URL-encoded filenames
- Detects and reports login failures

##Proof
![image](https://github.com/user-attachments/assets/e8575606-e1d1-4d07-b63a-7e7d4f4f5c27)
![image](https://github.com/user-attachments/assets/87b590bd-76f8-497c-bb3b-744c1f02e63f)

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
pip install requests beautifulsoup4 python-dotenv
```

### 3. Configure Environment Variables
Create a `.env` file in the same directory as `scraper.py` with the following content:
```
MYDY_USERNAME="your_lms_email@dypatil.edu"
MYDY_PASSWORD="your_lms_password"
```
**Do not use `USERNAME` as the variable name on Windows!**

### 4. Run the Script
Edit the `course_url` in `scraper.py` if you want to scrape a different course.
Then run:
```sh
python scraper.py
```

## Troubleshooting
- **Login failed!**
  - Double-check your `.env` file and make sure the variable names are `MYDY_USERNAME` and `MYDY_PASSWORD`.
  - Make sure your `.env` file is in the same directory as `scraper.py`.
  - If you see your Windows username instead of your LMS email, you are using the wrong variable name (`USERNAME` is reserved by Windows).
- **No files are downloaded:**
  - The script prints the number of activity links found. If this is 0, the course page structure may have changed, or you are not logged in.
  - Try running the script with your credentials hardcoded to debug.

## Security
- Your credentials are stored in `.env` and never hardcoded in the script. Do not share your `.env` file.
- Add `.env` to your `.gitignore` if you use version control.

## Customization
- To scrape a different course, change the `course_url` variable in `scraper.py`.
- The script can be extended to download from multiple courses or handle other activity types.

## License
MIT License. Use at your own risk. 
