import requests
from bs4 import BeautifulSoup
import os
import re
from urllib.parse import unquote
import dotenv

dotenv.load_dotenv()

# 1. Start a session
session = requests.Session()

# 2. Get login page to extract logintoken
login_url = 'https://mydy.dypatil.edu/rait/login/index.php'
login_page = session.get(login_url)
soup = BeautifulSoup(login_page.text, 'html.parser')
logintoken = soup.find('input', {'name': 'logintoken'})
if logintoken:
    logintoken = logintoken['value']
    print(f"Found logintoken: {logintoken}")
else:
    logintoken = None
    print("No logintoken found. Proceeding without it.")

# 3. Prepare login payload

username = os.getenv('MYDY_USERNAME')
password = os.getenv('MYDY_PASSWORD')

print(f"Username: {username[:2]}******{username[-2:]}")
print(f"Password: {password[:2]}******{password[-2:]}")

payload = {
    'username': username,
    'password': password
}
if logintoken:
    payload['logintoken'] = logintoken

# 4. Log in
login_resp = session.post(login_url, data=payload)
if 'login' in login_resp.url or 'Invalid login' in login_resp.text or 'incorrect' in login_resp.text.lower():
    print('Login failed! Please check your username and password.')
    exit(1)
else:
    print('Login successful!')

# 5. Visit a course page
course_url = 'https://mydy.dypatil.edu/rait/course/view.php?id=7095'
resp = session.get(course_url)
soup = BeautifulSoup(resp.text, 'html.parser')


# 6. Find all activity links
activity_types = [
    '/mod/resource/view.php',
    '/mod/flexpaper/view.php',
    '/mod/presentation/view.php',
    '/mod/casestudy/view.php',
    '/mod/dyquestion/view.php'
]
activity_links = []
# Find all <li> elements where 'activity' is one of the classes
for li in soup.find_all('li', class_=re.compile(r'\bactivity\b')):
    a = li.find('a', href=True)
    if a:
        href = a['href']
        if any(x in href for x in activity_types):
            full_url = href if href.startswith('http') else 'https://mydy.dypatil.edu' + href
            activity_links.append(full_url)
print(f"Found {len(activity_links)} activity links.")

# 7. Visit each activity page and extract/download the real file link
for activity_url in activity_links:
    print(f"Visiting activity: {activity_url}")
    activity_resp = session.get(activity_url)
    activity_soup = BeautifulSoup(activity_resp.text, 'html.parser')
    downloaded = False

    # Try to find direct file link (resource)
    for a in activity_soup.find_all('a', href=True):
        file_href = a['href']
        if 'pluginfile.php' in file_href or file_href.endswith(('.pdf', '.ppt', '.pptx', '.docx')):
            file_url = file_href if file_href.startswith('http') else 'https://mydy.dypatil.edu' + file_href
            print(f"  Downloading: {file_url}")
            file_resp = session.get(file_url)
            filename = unquote(file_url.split('/')[-1])
            with open(filename, 'wb') as f:
                f.write(file_resp.content)
            print(f"  Saved: {filename}")
            downloaded = True
            break

    # Try to find FlexPaper PDFFile in JS
    if not downloaded:
        pdf_links = re.findall(r"PDFFile\s*:\s*'([^']+)'", activity_resp.text)
        for pdf_url in pdf_links:
            print(f"  Downloading FlexPaper PDF: {pdf_url}")
            file_resp = session.get(pdf_url)
            filename = unquote(pdf_url.split('/')[-1])
            with open(filename, 'wb') as f:
                f.write(file_resp.content)
            print(f"  Saved: {filename}")
            downloaded = True

    # Try to find presentation download link (look for .ppt, .pptx)
    if not downloaded:
        for a in activity_soup.find_all('a', href=True):
            file_href = a['href']
            if file_href.endswith(('.ppt', '.pptx')):
                file_url = file_href if file_href.startswith('http') else 'https://mydy.dypatil.edu' + file_href
                print(f"  Downloading Presentation: {file_url}")
                file_resp = session.get(file_url)
                filename = unquote(file_url.split('/')[-1])
                with open(filename, 'wb') as f:
                    f.write(file_resp.content)
                print(f"  Saved: {filename}")
                downloaded = True
                break

    # Try to find file in iframe (presentation module)
    if not downloaded:
        iframe = activity_soup.find('iframe', id='presentationobject')
        if iframe and iframe.has_attr('src'):
            file_url = iframe['src']
            print(f"  Downloading from iframe: {file_url}")
            file_resp = session.get(file_url)
            filename = unquote(file_url.split('/')[-1])
            with open(filename, 'wb') as f:
                f.write(file_resp.content)
            print(f"  Saved: {filename}")
            downloaded = True

    # Try to find file in object (presentation module, PDF)
    if not downloaded:
        obj = activity_soup.find('object', id='presentationobject')
        if obj and obj.has_attr('data'):
            file_url = obj['data']
            print(f"  Downloading from object: {file_url}")
            file_resp = session.get(file_url)
            filename = unquote(file_url.split('/')[-1])
            with open(filename, 'wb') as f:
                f.write(file_resp.content)
            print(f"  Saved: {filename}")
            downloaded = True

    if not downloaded:
        print("  No downloadable file found on this activity page.")
