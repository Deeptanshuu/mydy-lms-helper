import requests
from bs4 import BeautifulSoup
import os
import re
from urllib.parse import unquote
import dotenv
import time
import random

# Rich imports for beautiful CLI
from rich.console import Console
from rich.progress import Progress, SpinnerColumn, TextColumn, BarColumn, TimeElapsedColumn, TimeRemainingColumn, FileSizeColumn, TotalFileSizeColumn, TransferSpeedColumn
from rich.table import Table
from rich.panel import Panel
from rich.text import Text
from rich.prompt import Prompt, Confirm, IntPrompt
from rich.layout import Layout
from rich.live import Live
from rich.align import Align
from rich.rule import Rule
from rich import box
from rich.columns import Columns
from rich.tree import Tree
from rich.status import Status
from rich.theme import Theme

dotenv.load_dotenv()

# Initialize Rich console
console = Console()

class MydyScraper:
    def __init__(self):
        self.session = requests.Session()
        # Rate limiting settings
        self.min_delay = 0.5  # Minimum delay between requests (seconds)
        self.max_delay = 0.5  # Maximum delay between requests (seconds)
        self.download_delay = 0.1  # Additional delay for file downloads
        
    def _rate_limit(self, operation_type="general"):
        """Apply rate limiting with random delays to avoid DDoS-like behavior"""
        if operation_type == "download":
            delay = random.uniform(self.min_delay + self.download_delay, self.max_delay + self.download_delay)
        else:
            delay = random.uniform(self.min_delay, self.max_delay)
        
        time.sleep(delay)
        
    def _show_banner(self):
        """Display beautiful banner"""
        banner_text = """
███╗   ███╗██╗   ██╗██████╗ ██╗   ██╗    ███████╗ ██████╗██████╗  █████╗ ██████╗ ███████╗██████╗ 
████╗ ████║╚██╗ ██╔╝██╔══██╗╚██╗ ██╔╝    ██╔════╝██╔════╝██╔══██╗██╔══██╗██╔══██╗██╔════╝██╔══██╗
██╔████╔██║ ╚████╔╝ ██║  ██║ ╚████╔╝     ███████╗██║     ██████╔╝███████║██████╔╝█████╗  ██████╔╝
██║╚██╔╝██║  ╚██╔╝  ██║  ██║  ╚██╔╝      ╚════██║██║     ██╔══██╗██╔══██║██╔═══╝ ██╔══╝  ██╔══██╗
██║ ╚═╝ ██║   ██║   ██████╔╝   ██║       ███████║╚██████╗██║  ██║██║  ██║██║     ███████╗██║  ██║
╚═╝     ╚═╝   ╚═╝   ╚═════╝    ╚═╝       ╚══════╝ ╚═════╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝     ╚══════╝╚═╝  ╚═╝
        """
        
        console.print(Panel(
            Align.center(Text(banner_text, style="bold #FF6500")),
            title="[bold #FF6500]Welcome to MYDY Course Scraper[/bold #FF6500]",
            subtitle="[italic #FF6500]Download your course materials without the pain[/italic #FF6500]",
            border_style="#FF6500",
            padding=(1, 2)
        ))
        
    def login(self):
        """Handle the two-step login process with beautiful UI"""
        
        with console.status("[bold #1E3E62]Starting session...", spinner="dots") as status:
            # Step 1: Access the university portal to get the username submission form
            initial_url = 'https://mydy.dypatil.edu/rait/login/index.php'
            initial_resp = self.session.get(initial_url)
            initial_soup = BeautifulSoup(initial_resp.text, 'html.parser')

            # Check if we're redirected to the custom login (username only page)
            if initial_resp.url == 'https://mydy.dypatil.edu/':
                status.update("[bold #FF6500]Detected custom username entry page")
                
                # Step 1: Submit username to get the Moodle login form
                username = os.getenv('MYDY_USERNAME')
                
                console.print(f"[bold #1E3E62]👤 Submitting username:[/bold #1E3E62] [#FF6500]{username[:2]}******{username[-2:]}[/#FF6500]")
                
                step1_payload = {
                    'username': username,
                    'wantsurl': '',
                    'next': 'Next'
                }
                
                # Submit username to get the password form
                step1_resp = self.session.post('https://mydy.dypatil.edu/index.php', data=step1_payload)
                
                # Check if we got redirected to Moodle login with username parameter
                if 'rait/login/index.php' in step1_resp.url and 'uname=' in step1_resp.url:
                    status.update("[bold #FF6500]Successfully redirected to Moodle login")
                    
                    # Follow the redirect to get the actual Moodle login form
                    moodle_login_resp = self.session.get(step1_resp.url)
                    login_soup = BeautifulSoup(moodle_login_resp.text, 'html.parser')
                    
                else:
                    console.print("[bold #0B192C]❌ Username submission didn't redirect to Moodle properly[/bold #0B192C]")
                    
                    # Try direct access to Moodle login with username parameter
                    extracted_username = username
                    direct_moodle_url = f"https://mydy.dypatil.edu/rait/login/index.php?uname={extracted_username}&wantsurl="
                    console.print(f"[bold #FF6500]🔄 Trying direct access to Moodle...[/bold #FF6500]")
                    
                    moodle_login_resp = self.session.get(direct_moodle_url)
                    login_soup = BeautifulSoup(moodle_login_resp.text, 'html.parser')

            else:
                status.update("[bold #1E3E62]Already on Moodle login page")
                login_soup = initial_soup
                moodle_login_resp = initial_resp

        # Now check if we have the real Moodle login form
        password_field = login_soup.find('input', {'name': 'password'})
        static_username = login_soup.find('input', {'name': 'uname_static'})

        if password_field:
            # Extract the pre-filled username if available
            if static_username and static_username.get('value'):
                prefilled_username = static_username['value']
                console.print(f"[bold #FF6500]👤 Username pre-filled:[/bold #FF6500] [#1E3E62]{prefilled_username[:2]}******{prefilled_username[-2:]}[/#1E3E62]")
            
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
            password = os.getenv('MYDY_PASSWORD')
            login_payload['password'] = password
            console.print(f"[bold #1E3E62]🔑 Password:[/bold #1E3E62] [#FF6500]{password[:2]}******{password[-2:]}[/#FF6500]")
            
            # Find the form action URL
            form = login_soup.find('form')
            if form and form.get('action'):
                login_action_url = form['action']
                if not login_action_url.startswith('http'):
                    login_action_url = 'https://mydy.dypatil.edu/rait/login/' + login_action_url.lstrip('/')
            else:
                login_action_url = 'https://mydy.dypatil.edu/rait/login/index.php'
            
            # Submit the login form
            with console.status("[bold green]🔐 Logging in...", spinner="dots") as status:
                login_start = time.time()
                login_resp = self.session.post(login_action_url, data=login_payload)
                
        else:
            console.print("[bold red]❌ No password field found - still on username page[/bold red]")
            
            # Try using session from redirect URL if available
            if 'step1_resp' in locals() and 'uname=' in step1_resp.url:
                console.print("[bold yellow]🔄 Attempting to use session from redirect URL...[/bold yellow]")
                
                # Access the redirect URL to trigger the session
                session_resp = self.session.get(step1_resp.url)
                
                # Now try to access the Moodle login page again
                moodle_retry_resp = self.session.get('https://mydy.dypatil.edu/rait/login/index.php')
                retry_soup = BeautifulSoup(moodle_retry_resp.text, 'html.parser')
                
                # Check if this worked
                retry_password_field = retry_soup.find('input', {'name': 'password'})
                if retry_password_field:
                    console.print("[bold green] Session retry worked - found password field![/bold green]")
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
                    
                    password = os.getenv('MYDY_PASSWORD')
                    login_payload['password'] = password
                    console.print(f"[bold blue]🔑 Password:[/bold blue] [cyan]{password[:2]}******{password[-2:]}[/cyan]")
                    
                    form = login_soup.find('form')
                    if form and form.get('action'):
                        login_action_url = form['action']
                        if not login_action_url.startswith('http'):
                            login_action_url = 'https://mydy.dypatil.edu/rait/login/' + login_action_url.lstrip('/')
                    else:
                        login_action_url = 'https://mydy.dypatil.edu/rait/login/index.php'
                    
                    with console.status("[bold green]🔐 Logging in...", spinner="dots") as status:
                        login_start = time.time()
                        login_resp = self.session.post(login_action_url, data=login_payload)
                        
                else:
                    console.print("[bold red]❌ Session retry failed - still no password field[/bold red]")
                    return False
            else:
                console.print("[bold red]❌ Cannot proceed without proper session/redirect[/bold red]")
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
                console.print(Panel(
                    "[bold red]❌ Login failed![/bold red]\n\n"
                    "[bold yellow]💡 Common issues:[/bold yellow]\n"
                    "   • Incorrect username or password in .env file\n"
                    "   • Using USERNAME instead of MYDY_USERNAME (Windows issue)\n"
                    "   • Network connectivity issues",
                    title="[bold red]Authentication Error[/bold red]",
                    border_style="red"
                ))
                
                if has_login_form:
                    console.print('[bold red] Detected: Still on login page after submission[/bold red]')
                if has_error:
                    console.print('[bold red] Detected: Error indicators in response[/bold red]')
                return False
            else:
                console.print(f'[bold green] Login successful! ({login_time:.2f}s)[/bold green]')
                return True
        else:
            console.print("[bold red]❌ Login process failed - never reached login submission[/bold red]")
            return False

    def get_available_courses(self):
        """Fetch courses from the dashboard sidebar navigation"""
        
        with console.status("[bold #1E3E62] Fetching courses from dashboard...", spinner="dots"):
            # Add rate limiting before dashboard request
            self._rate_limit("dashboard")
            
            dashboard_url = "https://mydy.dypatil.edu/rait/my/"
            dashboard_resp = self.session.get(dashboard_url)
            
            if dashboard_resp.status_code != 200:
                console.print(f"[bold red]❌ Failed to load dashboard: {dashboard_resp.status_code}[/bold red]")
                return []
            
            soup = BeautifulSoup(dashboard_resp.text, 'html.parser')
            courses = []
            seen_ids = set()
            
            # Method 1: Look in "Previous semester classes" block
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
            console.print(Panel(
                "[bold #FF6500] No courses found on dashboard.[/bold #FF6500]\n"
                "[#1E3E62] This might be normal if you're between semesters.[/#1E3E62]",
                title="[bold #FF6500]No Courses Found[/bold #FF6500]",
                border_style="#FF6500"
            ))
            with open('debug_dashboard.html', 'w', encoding='utf-8') as f:
                f.write(dashboard_resp.text)
            console.print("[#1E3E62]💾 Saved dashboard HTML for investigation[/#1E3E62]")
        else:
            console.print(f"[bold #FF6500]  Found {len(courses)} courses[/bold #FF6500]")
        
        return courses

    def display_course_menu(self, courses):
        """Display advanced course selection menu with multiple selection support"""
        
        # Warning panel
        console.print(Panel(
            "[bold #FF6500]⚠️  Note:[/bold #FF6500] Only courses you are enrolled in will be downloaded.\n"
            "[#1E3E62]But you can still download previous semester courses.[/#1E3E62]",
            title="[bold #FF6500]Important Information[/bold #FF6500]",
            border_style="#FF6500",
            padding=(0, 1)
        ))
        
        console.print()  # Add spacing
        
        # Create courses table
        table = Table(
            title="[bold #FF6500] Available Courses[/bold #FF6500]",
            box=box.ROUNDED,
            title_style="bold #FF6500",
            header_style="bold #1E3E62",
            border_style="#FF6500"
        )
        
        table.add_column("#", style="bold #FF6500", justify="center", width=4)
        table.add_column("Course Name", style="white", min_width=40)
        table.add_column("Course ID", style="#1E3E62", justify="center", width=10)
        table.add_column("Status", style="#FF6500", justify="center", width=12)
        
        for i, course in enumerate(courses, 1):
            table.add_row(
                str(i),
                course['name'],
                course['id'],
                "Available"
            )
        
        console.print(table)
        console.print()
        
        # Selection options panel
        options_table = Table(
            title="[bold #1E3E62] Selection Options[/bold #1E3E62]",
            box=box.SIMPLE,
            title_style="bold #1E3E62",
            border_style="#1E3E62",
            show_header=False
        )
        
        options_table.add_column("Option", style="bold #FF6500", width=20)
        options_table.add_column("Description", style="#1E3E62")
        
        options_table.add_row("Single course", "Enter course number (e.g., 1)")
        options_table.add_row("Multiple courses", "Enter numbers separated by commas (e.g., 1,3,5)")
        options_table.add_row("Range of courses", "Enter range with dash (e.g., 1-5)")
        options_table.add_row("All courses", "Enter 'all' or 'a'")
        options_table.add_row("Exit", "Enter 'q', 'quit', or 'exit'")
        
        console.print(options_table)
        console.print()
        
        while True:
            try:
                choice = Prompt.ask(
                    "[bold #FF6500]👆 Select courses to download[/bold #FF6500]",
                    default="all"
                ).strip()

                if choice.lower() in ['q', 'quit', 'exit']:
                    console.print("[bold #FF6500]👋 Goodbye![/bold #FF6500]")
                    time.sleep(10)
                    return None
                
                if choice.lower() in ['all', 'a']:
                    console.print(f"[bold #FF6500] Selected:[/bold #FF6500] [#1E3E62]All {len(courses)} courses[/#1E3E62]")
                    return courses
                
                selected_indices = []
                
                # Handle comma-separated values
                if ',' in choice:
                    parts = [p.strip() for p in choice.split(',')]
                    for part in parts:
                        if '-' in part:
                            # Handle range within comma-separated (e.g., "1,3-5,7")
                            start, end = map(int, part.split('-'))
                            selected_indices.extend(range(start, end + 1))
                        else:
                            selected_indices.append(int(part))
                
                # Handle range (e.g., "1-5")
                elif '-' in choice:
                    start, end = map(int, choice.split('-'))
                    selected_indices = list(range(start, end + 1))
                
                # Handle single number
                else:
                    selected_indices = [int(choice)]
                
                # Validate indices
                invalid_indices = [i for i in selected_indices if i < 1 or i > len(courses)]
                if invalid_indices:
                    console.print(f"[bold error]❌ Invalid course numbers:[/bold error] [error]{', '.join(map(str, invalid_indices))}[/error]")
                    console.print(f"[muted]Please enter numbers between 1 and {len(courses)}[/muted]")
                    continue
                
                # Remove duplicates and sort
                selected_indices = sorted(list(set(selected_indices)))
                selected_courses = [courses[i - 1] for i in selected_indices]
                
                # Display selection confirmation
                if len(selected_courses) == 1:
                    console.print(f"[bold #FF6500] Selected:[/bold #FF6500] [#1E3E62]{selected_courses[0]['name']}[/#1E3E62]")
                else:
                    console.print(f"[bold #FF6500] Selected {len(selected_courses)} courses:[/bold #FF6500]")
                    for i, course in enumerate(selected_courses, 1):
                        console.print(f"  [#0B192C]{i}.[/#0B192C] [#0B192C]{course['name']}[/#0B192C]")
                
                # Confirmation for multiple courses
                if len(selected_courses) > 3:
                    if not Confirm.ask(f"[bold #FF6500]Download {len(selected_courses)} courses?[/bold #FF6500]", default=True):
                        continue
                
                return selected_courses
                    
            except ValueError as e:
                console.print("[bold #FF6500]❌ Invalid input format.[/bold #FF6500]")
                console.print("[#1E3E62]Examples: '1', '1,3,5', '1-5', 'all'[/#1E3E62]")
            except KeyboardInterrupt:
                console.print("\n[bold #FF6500]👋 Goodbye![/bold #FF6500]")
                time.sleep(10)
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
        console.print(f"\n[bold #FF6500] Processing course:[/bold #FF6500] [#1e3e62]{course['name']}[/#1e3e62]")
        
        # Add rate limiting before course page request
        self._rate_limit("course")
        
        with console.status(f"[bold #1E3E62]Loading course page...", spinner="dots") as status:
            course_start = time.time()
            resp = self.session.get(course['url'])
            soup = BeautifulSoup(resp.text, 'html.parser')
            course_load_time = time.time() - course_start
            
        console.print(f"[bold #FF6500] Course page loaded[/bold #FF6500] [#1E3E62]({course_load_time:.2f}s)[/#1E3E62]")

        # Extract course name and create folder
        course_name = self.extract_course_name(soup)
        sanitized_course_name = self.sanitize_folder_name(course_name)
        course_folder = sanitized_course_name

        # Create the course folder if it doesn't exist
        if not os.path.exists(course_folder):
            os.makedirs(course_folder)
            console.print(f"[bold #FF6500] Created folder:[/bold #FF6500] [#1E3E62]{course_folder}[/#1E3E62]")
        else:
            console.print(f"[bold #1E3E62] Using existing folder:[/bold #1E3E62] [#1E3E62]{course_folder}[/#1E3E62]")

        # Find all activity links
        with console.status("[bold #1E3E62] Scanning for activities...", spinner="dots"):
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
        
        console.print(f"[bold #FF6500]Found {len(activity_links)} activities[/bold #FF6500]")
        
        if len(activity_links) == 0:
            console.print(Panel(
                "[bold #FF6500] No activities found in this course.[/bold #FF6500]\n"
                "[#1E3E62]This might be normal for some courses.[/#1E3E62]",
                title="[bold #FF6500]No Activities[/bold #FF6500]",
                border_style="#FF6500"
            ))
            return {'course': course_name, 'downloaded': 0, 'failed': 0, 'files': []}

        # Download files from activities
        downloaded_files = []
        failed_downloads = []

        # Create progress bar for activities (two rows: current file on top + course progress below)
        with Progress(
            TextColumn("{task.fields[prefix]:<12}"),
            TextColumn("{task.fields[filename]:<40}"),
            BarColumn(bar_width=30),
            TextColumn(" {task.percentage:>3.0f}% "),
            TextColumn("{task.fields[mb_progress]:>16}"),
            TextColumn("{task.fields[speed]:>10}"),
            TimeRemainingColumn(),
            console=console,
            transient=False,
            expand=True
        ) as progress:
            
            total_activities = len(activity_links)
            downloaded_count = 0
            
            # Stable current file task (first row)
            file_task_id = progress.add_task(
                "",
                total=None,
                prefix="",
                filename="Preparing...",
                mb_progress="",
                speed=""
            )
            
            # Stable course progress task (second row)
            overall_task = progress.add_task(
                "",
                total=total_activities,
                prefix="",
                filename=f"[#FF6500]Course Progress[/#FF6500]",
                mb_progress=f"0/{total_activities}",
                speed=""
            )
            
            for i, activity_url in enumerate(activity_links, 1):
                # Add rate limiting before each activity request
                self._rate_limit("activity")
                
                activity_resp = self.session.get(activity_url)
                activity_soup = BeautifulSoup(activity_resp.text, 'html.parser')
                downloaded = False

                # Try different download methods, using the stable per-file task
                downloaded = (
                    self._try_direct_download(activity_soup, course_folder, downloaded_files, progress, file_task_id) or
                    self._try_flexpaper_download(activity_resp, course_folder, downloaded_files, progress, file_task_id) or
                    self._try_presentation_download(activity_soup, course_folder, downloaded_files, progress, file_task_id) or
                    self._try_iframe_download(activity_soup, course_folder, downloaded_files, progress, file_task_id) or
                    self._try_object_download(activity_soup, course_folder, downloaded_files, progress, file_task_id)
                )

                # Update course progress
                if downloaded:
                    downloaded_count += 1
                progress.update(overall_task, advance=1, mb_progress=f"{downloaded_count}/{total_activities}")

                if not downloaded:
                    # Clear the per-file row to a neutral state
                    progress.update(file_task_id, total=None, completed=0, filename="Pending...", mb_progress="", speed="")
                    failed_downloads.append(activity_url)
                    console.print(f"  [bold #FF6500] No downloadable file found for activity {i}[/bold #FF6500]")

        return {
            'course': course_name,
            'folder': course_folder,
            'downloaded': len(downloaded_files),
            'failed': len(failed_downloads),
            'files': downloaded_files,
            'failed_urls': failed_downloads
        }

    def _try_direct_download(self, soup, folder, downloaded_files, progress=None, file_task_id=None):
        """Try to download direct file links"""
        for a in soup.find_all('a', href=True):
            file_href = a['href']
            if 'pluginfile.php' in file_href or file_href.endswith(('.pdf', '.ppt', '.pptx', '.docx')):
                file_url = file_href if file_href.startswith('http') else 'https://mydy.dypatil.edu' + file_href
                if self._download_file(file_url, folder, downloaded_files, "Direct", progress, file_task_id):
                    return True
        return False

    def _try_flexpaper_download(self, response, folder, downloaded_files, progress=None, file_task_id=None):
        """Try to download FlexPaper PDFs"""
        pdf_links = re.findall(r"PDFFile\s*:\s*'([^']+)'", response.text)
        for pdf_url in pdf_links:
            if self._download_file(pdf_url, folder, downloaded_files, "FlexPaper PDF", progress, file_task_id):
                return True
        return False

    def _try_presentation_download(self, soup, folder, downloaded_files, progress=None, file_task_id=None):
        """Try to download presentation files"""
        for a in soup.find_all('a', href=True):
            file_href = a['href']
            if file_href.endswith(('.ppt', '.pptx')):
                file_url = file_href if file_href.startswith('http') else 'https://mydy.dypatil.edu' + file_href
                if self._download_file(file_url, folder, downloaded_files, "Presentation", progress, file_task_id):
                    return True
        return False

    def _try_iframe_download(self, soup, folder, downloaded_files, progress=None, file_task_id=None):
        """Try to download from iframe sources"""
        iframe = soup.find('iframe', id='presentationobject')
        if iframe and iframe.has_attr('src'):
            file_url = iframe['src']
            if self._download_file(file_url, folder, downloaded_files, "Iframe", progress, file_task_id):
                return True
        return False

    def _try_object_download(self, soup, folder, downloaded_files, progress=None, file_task_id=None):
        """Try to download from object data"""
        obj = soup.find('object', id='presentationobject')
        if obj and obj.has_attr('data'):
            file_url = obj['data']
            if self._download_file(file_url, folder, downloaded_files, "Object", progress, file_task_id):
                return True
        return False

    def _download_file(self, url, folder, downloaded_files, source_type, progress=None, file_task_id=None):
        """Download a single file with simple progress tracking"""
        try:
            download_start = time.time()
            file_resp = self.session.get(url, stream=True)
            
            if file_resp.status_code != 200:
                return False
                
            filename = unquote(url.split('/')[-1])
            # Truncate filename for layout stability
            display_name = filename if len(filename) <= 40 else filename[:37] + "..."
            filepath = os.path.join(folder, filename)
            
            # Skip if file already exists and has same size
            total_size = int(file_resp.headers.get('content-length', 0))
            if os.path.exists(filepath) and total_size > 0:
                if os.path.getsize(filepath) == total_size:
                    download_time = time.time() - download_start
                    downloaded_files.append((filename, download_time))
                    console.print(f"  [bold #FF6500]Skipped (exists):[/bold #FF6500] [#1E3E62]{filename}[/#1E3E62]")
                    # Reset stable file row
                    if progress is not None and file_task_id is not None:
                        progress.update(file_task_id, total=None, completed=0, filename="Pending...", mb_progress="", speed="")
                    return True
            
            # Initialize the stable task for this file
            if progress is not None and file_task_id is not None:
                if total_size > 0:
                    total_mb = total_size / (1024 * 1024)
                    mb_progress_str = f"0.00MB/{total_mb:.2f}MB"
                    progress.update(file_task_id, total=total_size, filename=display_name, mb_progress=mb_progress_str, speed="")
                else:
                    progress.update(file_task_id, total=None, filename=display_name, mb_progress="0.00MB/?MB", speed="")
            
            # Download with live progress
            downloaded = 0
            with open(filepath, 'wb') as f:
                if total_size > 0:
                    for chunk in file_resp.iter_content(chunk_size=8192):
                        if chunk:
                            f.write(chunk)
                            downloaded += len(chunk)
                            if progress is not None and file_task_id is not None:
                                elapsed = time.time() - download_start
                                speed_mb_s = (downloaded / (1024 * 1024)) / elapsed if elapsed > 0 else 0
                                downloaded_mb = downloaded / (1024 * 1024)
                                total_mb = total_size / (1024 * 1024)
                                progress.update(
                                    file_task_id,
                                    advance=len(chunk),
                                    mb_progress=f"{downloaded_mb:.2f}MB/{total_mb:.2f}MB",
                                    speed=f"{speed_mb_s:.1f} MB/s"
                                )
                else:
                    for chunk in file_resp.iter_content(chunk_size=8192):
                        if chunk:
                            f.write(chunk)
                            downloaded += len(chunk)
                            if progress is not None and file_task_id is not None:
                                elapsed = time.time() - download_start
                                speed_mb_s = (downloaded / (1024 * 1024)) / elapsed if elapsed > 0 else 0
                                downloaded_mb = downloaded / (1024 * 1024)
                                progress.update(
                                    file_task_id,
                                    mb_progress=f"{downloaded_mb:.2f}MB/?MB",
                                    speed=f"{speed_mb_s:.1f} MB/s"
                                )
            
            # Reset stable file row to neutral after completion
            if progress is not None and file_task_id is not None:
                progress.update(file_task_id, total=None, completed=0, filename="Pending...", mb_progress="", speed="")
            
            download_time = time.time() - download_start
            downloaded_files.append((filename, download_time))
            
            # Format file size for display
            if total_size > 0:
                size_mb = total_size / (1024 * 1024)
                size_str = f"{size_mb:.1f}MB" if size_mb >= 1 else f"{total_size / 1024:.1f}KB"
            else:
                size_str = "Unknown size"
                
            console.print(f"  [bold #FF6500] Downloaded:[/bold #FF6500] [#1E3E62]{filename}[/#1E3E62] [#1E3E62]({size_str}, {download_time:.2f}s)[/#1E3E62]")
            return True
            
        except Exception as e:
            console.print(f"  [bold #000000]❌ Error downloading:[/bold #000000] [#000000]{str(e)}[/000000]")
            return False

    def display_summary(self, results, download_start_time):
        """Display beautiful download summary for all courses"""
        total_time = time.time() - download_start_time
        total_files = sum(result['downloaded'] for result in results)
        total_failed = sum(result['failed'] for result in results)
        
        # Create summary table
        summary_table = Table(
            title="[bold #1e3e62] Download Summary[/bold #1e3e62]",
            box=box.ROUNDED,
            title_style="bold #1e3e62",
            border_style="#1e3e62"
        )
        
        summary_table.add_column("Metric", style="bold #1E3E62", justify="left")
        summary_table.add_column("Value", style="bold #FF6500", justify="center")
        
        summary_table.add_row(" Courses processed", str(len(results)))
        summary_table.add_row(" Files downloaded", str(total_files))
        summary_table.add_row("  Failed activities", str(total_failed))
        summary_table.add_row("  Total time", f"{total_time:.2f}s")
        
        console.print()
        console.print(summary_table)
        
        # Course breakdown if multiple courses
        if len(results) > 1:
            console.print()
            breakdown_table = Table(
                title="[bold #1E3E62]📋 Course Breakdown[/bold #1E3E62]",
                box=box.SIMPLE,
                title_style="bold #1E3E62",
                border_style="#1E3E62"
            )
            
            breakdown_table.add_column("Course", style="#0B192C", min_width=30)
            breakdown_table.add_column("Files", style="#FF6500", justify="center")
            breakdown_table.add_column("Folder", style="#1E3E62", min_width=20)
            
            for result in results:
                breakdown_table.add_row(
                    result['course'],
                    str(result['downloaded']),
                    result.get('folder', 'N/A')
                )
            
            console.print(breakdown_table)
        
        # Downloaded files tree
        if any(result['files'] for result in results):
            console.print()
            console.print("[bold #FF6500] Downloaded Files:[/bold #FF6500]")
            
            for result in results:
                if result['files']:
                    tree = Tree(f"[bold #1E3E62] {result['course']}[/bold #1E3E62]")
                    for filename, download_time in result['files']:
                        tree.add(f"[#FF6500]• {filename}[/#FF6500] [#1E3E62]({download_time:.2f}s)[/#1E3E62]")
                    console.print(tree)
        
        # Final success message
        console.print()
        console.print(Panel(
            f"[bold #FF6500]🎉 All processing completed successfully![/bold #FF6500]\n\n"
            f"[bold #1E3E62] Stats:[/bold #1E3E62]\n"
            f"  • {total_files} files downloaded\n"
            f"  • {len(results)} courses processed\n"
            f"  • {total_time:.2f}s total time\n\n"
            f"[#1E3E62]Files are saved in their respective course folders.[/#1E3E62]",
            title="[bold #FF6500] Success![/bold #FF6500]",
            border_style="#FF6500",
            padding=(1, 2)
        ))

def main():
    # Clear console and show banner
    console.clear()
    
    scraper = MydyScraper()
    scraper._show_banner()
    
    console.print()  # Add spacing
    
    # Login
    if not scraper.login():
        console.print(Panel(
            "[bold #000000]❌ Login failed. Please check your credentials and try again.[/bold #000000]",
            title="[bold #000000]Authentication Failed[/bold #000000]",
            border_style="#000000"
        ))
        return
    
    console.print()  # Add spacing
    
    # Get available courses
    courses = scraper.get_available_courses()
    if not courses:
        console.print(Panel(
            "[bold #FF6500]❌ No courses found. This might be normal between semesters.[/bold #FF6500]",
            title="[bold #FF6500]No Courses Available[/bold #FF6500]",
            border_style="#FF6500"
        ))
        return
    
    console.print()  # Add spacing
    
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
    
    # Add graceful exit countdown (single, live-updating panel)
    def countdown(seconds: int = 10):
        try:
            with Live(console=console, refresh_per_second=10) as live:
                for remaining in range(seconds, 0, -1):
                    panel = Panel(
                        f"[bold #FF6500]Program will exit in {remaining} seconds...[/bold #FF6500]\n[#1E3E62]Press Ctrl+C to exit immediately[/#1E3E62]",
                        title="[bold #FF6500]Auto-Exit Timer[/bold #FF6500]",
                        border_style="#FF6500",
                        padding=(0, 1)
                    )
                    live.update(panel)
                    time.sleep(1)
        except KeyboardInterrupt:
            console.print("\n[bold #FF6500]👋 Exiting immediately...[/bold #FF6500]")
            return
    
    countdown(10)
    console.print("[bold #FF6500]👋 Goodbye![/bold #FF6500]")

if __name__ == "__main__":
    main()
