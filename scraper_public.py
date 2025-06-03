import requests
from bs4 import BeautifulSoup
import os
import re
from urllib.parse import unquote
import time
from tqdm import tqdm
import random
import getpass

class MydyScraper:
    def __init__(self):
        self.session = requests.Session()
        # Rate limiting settings
        self.min_delay = 0.5  # Minimum delay between requests (seconds)
        self.max_delay = 2.0  # Maximum delay between requests (seconds)
        self.download_delay = 0.3  # Additional delay for file downloads
        
    def _rate_limit(self, operation_type="general"):
        """Apply rate limiting with random delays to avoid DDoS-like behavior"""
        if operation_type == "download":
            delay = random.uniform(self.min_delay + self.download_delay, self.max_delay + self.download_delay)
        else:
            delay = random.uniform(self.min_delay, self.max_delay)
        
        time.sleep(delay)
        
    def get_credentials(self):
        """Prompt user for their MyDY credentials"""
        print("🔐 MyDY Login Credentials Required")
        print("=" * 40)
        print("⚠️  Your credentials are only used for this session and are NOT stored anywhere!")
        print("💡 Use your regular MyDY username and password")
        print()
        
        while True:
            username = input("👤 Enter your MyDY username: ").strip()
            if username:
                break
            print("❌ Username cannot be empty. Please try again.")
        
        while True:
            password = getpass.getpass("🔑 Enter your MyDY password: ")
            if password:
                break
            print("❌ Password cannot be empty. Please try again.")
        
        return username, password
        
    def login(self, username=None, password=None):
        """Handle the two-step login process"""
        if not username or not password:
            username, password = self.get_credentials()
            
        print("🔄 Starting session...")

        # Step 1: Access the university portal to get the username submission form
        initial_url = 'https://mydy.dypatil.edu/rait/login/index.php'
        initial_resp = self.session.get(initial_url)
        initial_soup = BeautifulSoup(initial_resp.text, 'html.parser')

        # Check if we're redirected to the custom login (username only page)
        if initial_resp.url == 'https://mydy.dypatil.edu/':
            
            # Step 1: Submit username to get the Moodle login form
            print(f"👤 Submitting username: {username[:2]}******{username[-2:]}")
            
            step1_payload = {
                'username': username,
                'wantsurl': '',
                'next': 'Next'
            }
            
            # Submit username to get the password form
            step1_resp = self.session.post('https://mydy.dypatil.edu/index.php', data=step1_payload)
            
            # Check if we got redirected to Moodle login with username parameter
            if 'rait/login/index.php' in step1_resp.url and 'uname=' in step1_resp.url:
                
                # Follow the redirect to get the actual Moodle login form
                moodle_login_resp = self.session.get(step1_resp.url)
                login_soup = BeautifulSoup(moodle_login_resp.text, 'html.parser')
                
            else:
                print("❌ Username submission didn't redirect to Moodle properly")
                
                # Try direct access to Moodle login with username parameter
                extracted_username = username
                direct_moodle_url = f"https://mydy.dypatil.edu/rait/login/index.php?uname={extracted_username}&wantsurl="
                print(f"🔄 Trying direct access to: {direct_moodle_url}")
                
                moodle_login_resp = self.session.get(direct_moodle_url)
                login_soup = BeautifulSoup(moodle_login_resp.text, 'html.parser')

        else:
            print("🔍 Already on Moodle login page")
            login_soup = initial_soup
            moodle_login_resp = initial_resp

        # Now check if we have the real Moodle login form
        password_field = login_soup.find('input', {'name': 'password'})
        static_username = login_soup.find('input', {'name': 'uname_static'})

        if password_field:
            
            # Extract the pre-filled username if available
            if static_username and static_username.get('value'):
                prefilled_username = static_username['value']
                print(f"📝 Username pre-filled: {prefilled_username[:2]}******{prefilled_username[-2:]}")
            
            # Look for any hidden fields or tokens
            hidden_inputs = login_soup.find_all('input', {'type': 'hidden'})
            
            # Prepare login payload with all hidden fields
            login_payload = {}
            for inp in hidden_inputs:
                name = inp.get('name')
                value = inp.get('value', '')
                if name:
                    login_payload[name] = value
            
            # Add password to payload
            login_payload['password'] = password
            print(f"🔑 Password: {password[:2]}******{password[-2:]}")
            
            # Find the form action URL
            form = login_soup.find('form')
            if form and form.get('action'):
                login_action_url = form['action']
                if not login_action_url.startswith('http'):
                    login_action_url = 'https://mydy.dypatil.edu/rait/login/' + login_action_url.lstrip('/')
            else:
                login_action_url = 'https://mydy.dypatil.edu/rait/login/index.php'
            
            # Submit the login form
            print("🔐 Logging in...")
            login_start = time.time()
            login_resp = self.session.post(login_action_url, data=login_payload)
            
        else:
            print("❌ No password field found - still on username page")
            
            # Try using session from redirect URL if available
            if 'step1_resp' in locals() and 'uname=' in step1_resp.url:
                print("🔄 Attempting to use session from redirect URL...")
                
                # Access the redirect URL to trigger the session
                session_resp = self.session.get(step1_resp.url)
                
                # Now try to access the Moodle login page again
                moodle_retry_resp = self.session.get('https://mydy.dypatil.edu/rait/login/index.php')
                retry_soup = BeautifulSoup(moodle_retry_resp.text, 'html.parser')
                
                # Check if this worked
                retry_password_field = retry_soup.find('input', {'name': 'password'})
                if retry_password_field:
                    print("✅ Session retry worked - found password field!")
                    login_soup = retry_soup
                    moodle_login_resp = moodle_retry_resp
                    
                    # Continue with the login process
                    hidden_inputs = login_soup.find_all('input', {'type': 'hidden'})
                    
                    login_payload = {}
                    for inp in hidden_inputs:
                        name = inp.get('name')
                        value = inp.get('value', '')
                        if name:
                            login_payload[name] = value
                    
                    login_payload['password'] = password
                    print(f"🔑 Password: {password[:2]}******{password[-2:]}")
                    
                    form = login_soup.find('form')
                    if form and form.get('action'):
                        login_action_url = form['action']
                        if not login_action_url.startswith('http'):
                            login_action_url = 'https://mydy.dypatil.edu/rait/login/' + login_action_url.lstrip('/')
                    else:
                        login_action_url = 'https://mydy.dypatil.edu/rait/login/index.php'
                    
                    print("🔐 Logging in...")
                    login_start = time.time()
                    login_resp = self.session.post(login_action_url, data=login_payload)
                    
                else:
                    print("❌ Session retry failed - still no password field")
                    return False
            else:
                print("❌ Cannot proceed without proper session/redirect")
                return False

        # Check login success
        if 'login_resp' in locals():
            login_time = time.time() - login_start

            # Improved login success detection
            login_successful = False
            
            # Check if we're back on a login page (indicates failure)
            login_soup = BeautifulSoup(login_resp.text, 'html.parser')
            
            # Look for login form indicators (means we're still on login page)
            has_login_form = (
                login_soup.find('input', {'name': 'username'}) is not None or
                login_soup.find('input', {'name': 'password'}) is not None or
                'login' in login_resp.url.lower() or
                'notloggedin' in login_resp.text.lower()
            )
            
            # Look for error indicators
            has_error = (
                'errorcode' in login_resp.url or
                'invalid login' in login_resp.text.lower() or
                'login failed' in login_resp.text.lower() or
                'incorrect username' in login_resp.text.lower() or
                'incorrect password' in login_resp.text.lower()
            )
            
            # Look for success indicators
            has_success_indicators = (
                'dashboard' in login_resp.text.lower() or
                'my home' in login_resp.text.lower() or
                'logout' in login_resp.text.lower() or
                'profile' in login_resp.text.lower() or
                ('course' in login_resp.text.lower() and len(login_resp.text) > 10000)
            )
            
            # Determine login success
            if has_login_form or has_error:
                login_successful = False
            elif has_success_indicators and not has_login_form:
                login_successful = True
            elif login_resp.url and 'rait' in login_resp.url and 'login' not in login_resp.url and not has_login_form:
                login_successful = True

            if not login_successful:
                print('❌ Login failed! Please check your username and password.')
                print('💡 Common issues:')
                print('   - Incorrect username or password')
                print('   - Network connectivity issues')
                print('   - MyDY server maintenance')
                if has_login_form:
                    print('🔍 Detected: Still on login page after submission')
                if has_error:
                    print('🔍 Detected: Error indicators in response')
                return False
            else:
                print(f'✅ Login successful! (took {login_time:.2f}s)')
                return True
        else:
            print("❌ Login process failed - never reached login submission")
            return False

    def get_available_courses(self):
        """Fetch courses from the dashboard sidebar navigation"""
        print("📚 Fetching courses from dashboard...")
        
        # Add rate limiting before dashboard request
        self._rate_limit("dashboard")
        
        dashboard_url = "https://mydy.dypatil.edu/rait/my/"
        dashboard_resp = self.session.get(dashboard_url)
        
        if dashboard_resp.status_code != 200:
            print(f"❌ Failed to load dashboard: {dashboard_resp.status_code}")
            return []
        
        soup = BeautifulSoup(dashboard_resp.text, 'html.parser')
        courses = []
        seen_ids = set()
        
        # Method 1: Look in "Previous semester classes" block
        print("🔍 Scanning Previous semester classes block...")
        prev_classes_block = soup.find('div', {'id': re.compile(r'.*stu_previousclasses.*')})
        if prev_classes_block:
            course_links = prev_classes_block.find_all('a', href=re.compile(r'/course/view\.php\?id=\d+'))
            for link in course_links:
                href = link.get('href', '')
                match = re.search(r'id=(\d+)', href)
                if match:
                    course_id = match.group(1)
                    if course_id not in seen_ids:
                        seen_ids.add(course_id)
                        course_name = link.get_text(strip=True)
                        full_url = href if href.startswith('http') else 'https://mydy.dypatil.edu' + href
                        courses.append({
                            'id': course_id,
                            'name': course_name,
                            'url': full_url
                        })
        
        # Method 2: Look in navigation blocks
        nav_blocks = soup.find_all(['div'], class_=re.compile(r'block.*navigation|block.*tree|block.*university'))
        for block in nav_blocks:
            course_links = block.find_all('a', href=re.compile(r'/course/view\.php\?id=\d+'))
            for link in course_links:
                href = link.get('href', '')
                match = re.search(r'id=(\d+)', href)
                if match:
                    course_id = match.group(1)
                    if course_id not in seen_ids:
                        seen_ids.add(course_id)
                        course_name = link.get_text(strip=True)
                        full_url = href if href.startswith('http') else 'https://mydy.dypatil.edu' + href
                        courses.append({
                            'id': course_id,
                            'name': course_name,
                            'url': full_url
                        })
        
        # Method 3: Fallback - scan entire page
        if not courses:
            print("🔍 Scanning entire dashboard for course links...")
            all_course_links = soup.find_all('a', href=re.compile(r'/course/view\.php\?id=\d+'))
            for link in all_course_links:
                href = link.get('href', '')
                match = re.search(r'id=(\d+)', href)
                if match:
                    course_id = match.group(1)
                    if course_id not in seen_ids:
                        seen_ids.add(course_id)
                        course_name = link.get_text(strip=True)
                        if course_name and len(course_name.strip()) > 2:
                            full_url = href if href.startswith('http') else 'https://mydy.dypatil.edu' + href
                            courses.append({
                                'id': course_id,
                                'name': course_name,
                                'url': full_url
                            })
        
        # Sort courses by ID (newer course IDs are usually higher numbers)
        courses.sort(key=lambda x: int(x['id']), reverse=True)
        
        if not courses:
            print("⚠️  No courses found on dashboard.")
            print("💡 This might be normal if you're between semesters.")
            with open('debug_dashboard.html', 'w', encoding='utf-8') as f:
                f.write(dashboard_resp.text)
            print("💾 Saved dashboard HTML for investigation")
        else:
            print(f"✅ Found {len(courses)} courses")
        
        return courses

    def display_course_menu(self, courses):
        """Display warning that course which you are not enrolled in will not be downloaded"""
        
        print(f"\n{'='*60}")
        print("⚠️  Note: Only courses you are enrolled in will be downloaded. But you can still download previous semester courses.")
        print(f"{'='*60}")
        
        """Display course selection menu"""
        print(f"\n{'='*60}")
        print(f"📋 AVAILABLE COURSES")
        print(f"{'='*60}")
        
        for i, course in enumerate(courses, 1):
            print(f"{i:2d}. {course['name']} (ID: {course['id']})")
        
        print(f"{len(courses)+1:2d}. Download ALL courses")
        print(f"{'='*60}")
        
        while True:
            try:
                choice = input(f"\n👆 Select course to download (1-{len(courses)+1}): ")

                if choice.lower() in ['q', 'quit', 'exit']:
                    print("👋 Goodbye!")
                    return None
                
                choice_num = int(choice)
                if 1 <= choice_num <= len(courses):
                    return [courses[choice_num - 1]]
                elif choice_num == len(courses) + 1:
                    return courses
                else:
                    print(f"❌ Invalid choice. Please enter a number between 1 and {len(courses)+1}")
                    
            except ValueError:
                print("❌ Invalid input. Please enter a number or 'q' to quit")
            except KeyboardInterrupt:
                print("\n👋 Goodbye!")
                return None

    def sanitize_folder_name(self, name):
        """Sanitize course name for folder creation"""
        return re.sub(r'[<>:"/\\|?*]', '_', name).strip()

    def extract_course_name(self, soup):
        """Extract course name from page title"""
        title_tag = soup.find('title')
        if title_tag:
            title_text = title_tag.get_text()
            if "Course:" in title_text:
                return title_text.split("Course:", 1)[1].strip()
            else:
                return title_text.strip()
        return "Unknown Course"

    def download_course(self, course):
        """Download all materials from a single course"""
        print(f"\n🎯 Processing course: {course['name']}")
        
        # Add rate limiting before course page request
        self._rate_limit("course")
        
        course_start = time.time()
        resp = self.session.get(course['url'])
        soup = BeautifulSoup(resp.text, 'html.parser')
        course_load_time = time.time() - course_start
        print(f"✅ Course page loaded (took {course_load_time:.2f}s)")

        # Extract course name and create folder
        course_name = self.extract_course_name(soup)
        sanitized_course_name = self.sanitize_folder_name(course_name)
        course_folder = sanitized_course_name

        # Create the course folder if it doesn't exist
        if not os.path.exists(course_folder):
            os.makedirs(course_folder)
            print(f"📁 Created folder: {course_folder}")
        else:
            print(f"📁 Using existing folder: {course_folder}")

        # Find all activity links
        print("🔍 Scanning for activities...")
        activity_types = [
            '/mod/resource/view.php',
            '/mod/flexpaper/view.php',
            '/mod/presentation/view.php',
            '/mod/casestudy/view.php',
            '/mod/dyquestion/view.php'
        ]
        activity_links = []
        
        for li in soup.find_all('li', class_=re.compile(r'\bactivity\b')):
            a = li.find('a', href=True)
            if a:
                href = a['href']
                if any(x in href for x in activity_types):
                    full_url = href if href.startswith('http') else 'https://mydy.dypatil.edu' + href
                    activity_links.append(full_url)
        
        print(f"✅ Found {len(activity_links)} activity links.")
        
        if len(activity_links) == 0:
            print("⚠️  No activities found in this course.")
            return {'course': course_name, 'downloaded': 0, 'failed': 0, 'files': []}

        # Download files from activities
        downloaded_files = []
        failed_downloads = []

        with tqdm(total=len(activity_links), desc=f"Processing {course_name[:20]}...", unit="activity") as pbar:
            for i, activity_url in enumerate(activity_links, 1):
                pbar.set_description(f"Processing {course_name[:15]}... {i}/{len(activity_links)}")
                
                # Add rate limiting before each activity request
                self._rate_limit("activity")
                
                activity_start = time.time()
                activity_resp = self.session.get(activity_url)
                activity_soup = BeautifulSoup(activity_resp.text, 'html.parser')
                downloaded = False

                # Try different download methods
                downloaded = (
                    self._try_direct_download(activity_soup, course_folder, downloaded_files) or
                    self._try_flexpaper_download(activity_resp, course_folder, downloaded_files) or
                    self._try_presentation_download(activity_soup, course_folder, downloaded_files) or
                    self._try_iframe_download(activity_soup, course_folder, downloaded_files) or
                    self._try_object_download(activity_soup, course_folder, downloaded_files)
                )

                if not downloaded:
                    failed_downloads.append(activity_url)
                
                pbar.update(1)

        return {
            'course': course_name,
            'folder': course_folder,
            'downloaded': len(downloaded_files),
            'failed': len(failed_downloads),
            'files': downloaded_files,
            'failed_urls': failed_downloads
        }

    def _try_direct_download(self, soup, folder, downloaded_files):
        """Try to download direct file links"""
        for a in soup.find_all('a', href=True):
            file_href = a['href']
            if 'pluginfile.php' in file_href or file_href.endswith(('.pdf', '.ppt', '.pptx', '.docx')):
                file_url = file_href if file_href.startswith('http') else 'https://mydy.dypatil.edu' + file_href
                if self._download_file(file_url, folder, downloaded_files, "Direct"):
                    return True
        return False

    def _try_flexpaper_download(self, response, folder, downloaded_files):
        """Try to download FlexPaper PDFs"""
        pdf_links = re.findall(r"PDFFile\s*:\s*'([^']+)'", response.text)
        for pdf_url in pdf_links:
            if self._download_file(pdf_url, folder, downloaded_files, "FlexPaper PDF"):
                return True
        return False

    def _try_presentation_download(self, soup, folder, downloaded_files):
        """Try to download presentation files"""
        for a in soup.find_all('a', href=True):
            file_href = a['href']
            if file_href.endswith(('.ppt', '.pptx')):
                file_url = file_href if file_href.startswith('http') else 'https://mydy.dypatil.edu' + file_href
                if self._download_file(file_url, folder, downloaded_files, "Presentation"):
                    return True
        return False

    def _try_iframe_download(self, soup, folder, downloaded_files):
        """Try to download from iframe sources"""
        iframe = soup.find('iframe', id='presentationobject')
        if iframe and iframe.has_attr('src'):
            file_url = iframe['src']
            if self._download_file(file_url, folder, downloaded_files, "Iframe"):
                return True
        return False

    def _try_object_download(self, soup, folder, downloaded_files):
        """Try to download from object data"""
        obj = soup.find('object', id='presentationobject')
        if obj and obj.has_attr('data'):
            file_url = obj['data']
            if self._download_file(file_url, folder, downloaded_files, "Object"):
                return True
        return False

    def _download_file(self, url, folder, downloaded_files, source_type):
        """Download a single file with progress tracking"""
        try:
            download_start = time.time()
            file_resp = self.session.get(url, stream=True)
            
            if file_resp.status_code != 200:
                return False
                
            filename = unquote(url.split('/')[-1])
            filepath = os.path.join(folder, filename)
            
            # Skip if file already exists and has same size
            total_size = int(file_resp.headers.get('content-length', 0))
            if os.path.exists(filepath) and total_size > 0:
                if os.path.getsize(filepath) == total_size:
                    download_time = time.time() - download_start
                    downloaded_files.append((filename, download_time))
                    return True
            
            with open(filepath, 'wb') as f:
                if total_size > 0:
                    with tqdm(total=total_size, unit='B', unit_scale=True, desc=f"⬇️  {filename[:20]}...", leave=False) as download_pbar:
                        for chunk in file_resp.iter_content(chunk_size=8192):
                            if chunk:
                                f.write(chunk)
                                download_pbar.update(len(chunk))
                else:
                    f.write(file_resp.content)
            
            download_time = time.time() - download_start
            downloaded_files.append((filename, download_time))
            return True
            
        except Exception as e:
            return False

    def display_summary(self, results, download_start_time):
        """Display download summary for all courses"""
        total_time = time.time() - download_start_time
        total_files = sum(result['downloaded'] for result in results)
        total_failed = sum(result['failed'] for result in results)
        
        print(f"\n{'='*60}")
        print(f"📊 DOWNLOAD SUMMARY")
        print(f"{'='*60}")
        print(f"🎓 Courses processed: {len(results)}")
        print(f"✅ Total files downloaded: {total_files}")
        print(f"⚠️  Total failed activities: {total_failed}")
        print(f"⏱️  Total download time: {total_time:.2f}s")
        
        if len(results) > 1:
            print(f"\n📋 Course breakdown:")
            for result in results:
                print(f"  📁 {result['course']}: {result['downloaded']} files")
        
        if any(result['files'] for result in results):
            print(f"\n📄 Downloaded files:")
            for result in results:
                if result['files']:
                    print(f"  📁 {result['course']}:")
                    for filename, download_time in result['files']:
                        print(f"    • {filename} ({download_time:.2f}s)")
        
        print(f"\n🎉 All processing completed!")
        print(f"🔒 Your credentials were not saved and this session is now closed.")
        print(f"{'='*60}")

def main():
    print("🎓 MyDY Course Material Downloader")
    print("=" * 40)
    print("📚 Download your course materials from MyDY portal")
    print("🔐 Your login credentials are secure and not stored")
    print("=" * 40)
    print()
    
    scraper = MydyScraper()
    
    # Login with user-provided credentials
    if not scraper.login():
        print("❌ Login failed. Please check your credentials and try again.")
        input("\nPress Enter to exit...")
        return
    
    # Get available courses
    courses = scraper.get_available_courses()
    if not courses:
        print("❌ No courses found. This might be normal between semesters.")
        input("\nPress Enter to exit...")
        return
    
    # Display course selection menu
    selected_courses = scraper.display_course_menu(courses)
    if not selected_courses:
        return
    
    # Start timing downloads only after menu selection
    download_start_time = time.time()
    
    # Download selected courses
    results = []
    for course in selected_courses:
        result = scraper.download_course(course)
        results.append(result)
    
    # Display final summary with actual download time
    scraper.display_summary(results, download_start_time)
    
    # Keep window open for user to see results
    input("\nPress Enter to exit...")

if __name__ == "__main__":
    main()