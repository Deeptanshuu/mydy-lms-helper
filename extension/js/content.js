const MYDY_ORIGIN = 'https://mydy.dypatil.edu';
const DASHBOARD_URL = 'https://mydy.dypatil.edu/rait/my/';
// Every request to MyDy from a download run (a page or a file) waits at least this long after the
// previous one, so it never sends a burst. The terminal app paces itself the same way.
const REQUEST_GAP_MS = 800;
const PAGE_TIMEOUT_MS = 30000;
const ACTIVITY_TYPES = ['resource', 'flexpaper', 'presentation', 'casestudy', 'dyquestion'];

class MydyContentScript {
    constructor() {
        this.isLoggedIn = false;
        this.running = false;
        this.lastRequest = 0;
        this.setupMessageListener();
        this.checkLoginStatus();
    }

    setupMessageListener() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            switch (message.action) {
                case 'checkLogin':
                    this.handleCheckLogin(sendResponse);
                    return true; // Keep message channel open for async response
                    
                case 'getCourses':
                    this.handleGetCourses(sendResponse);
                    return true;
                    
                case 'downloadCourses':
                    this.handleDownloadCourses(message.courses, sendResponse);
                    return true;

                case 'status':
                    sendResponse({ running: this.running });
                    return false;
                    
                default:
                    sendResponse({ error: 'Unknown action' });
            }
        });
    }

    checkLoginStatus() {
        // Check for common Moodle login indicators
        const loginIndicators = [
            document.querySelector('a[href*="logout"]'),
            document.querySelector('.usermenu'),
            document.querySelector('.logininfo'),
            document.querySelector('#user-menu-toggle')
        ];

        this.isLoggedIn = loginIndicators.some(indicator => indicator !== null) &&
                         !window.location.href.includes('login') &&
                         !document.querySelector('input[name="password"]');
    }

    handleCheckLogin(sendResponse) {
        this.checkLoginStatus();
        sendResponse({ loggedIn: this.isLoggedIn });
    }

    async handleGetCourses(sendResponse) {
        try {
            if (!this.isLoggedIn) {
                sendResponse({ error: 'Not logged in' });
                return;
            }

            if (window.location.href.includes('/my/') || window.location.href.includes('/course/')) {
                this.getCourses(sendResponse, document);
            } else {
                // Read the dashboard in the background instead of leaving the page the student is on.
                const page = await this.fetchPage(DASHBOARD_URL);
                if (!page.doc) throw new Error("Couldn't open the MyDy dashboard");
                this.getCourses(sendResponse, page.doc);
            }
        } catch (error) {
            console.error('Error getting courses:', error);
            sendResponse({ error: error.message });
        }
    }

    getCourses(sendResponse, doc = document) {
        const courses = [];
        const seenIds = new Set();

        // Method 1: Look for course cards/boxes with proper structure
        const courseContainers = doc.querySelectorAll('.coursebox, .course-info-container, .course-listitem');
        courseContainers.forEach(container => {
            const courseLink = container.querySelector('a[href*="/course/view.php?id="]');
            if (courseLink) {
                const href = courseLink.getAttribute('href');
                const match = href.match(/id=(\d+)/);
                if (match) {
                    const courseId = match[1];
                    if (!seenIds.has(courseId)) {
                        seenIds.add(courseId);
                        
                        // Try multiple methods to get course name
                        let courseName = this.extractCourseName(container, courseLink);
                        
                        if (courseName && courseName.length > 2) {
                            const fullUrl = href.startsWith('http') ? href : 'https://mydy.dypatil.edu' + href;
                            courses.push({
                                id: courseId,
                                name: courseName,
                                url: fullUrl
                            });
                        }
                    }
                }
            }
        });

        // Method 2: Look in navigation blocks and course lists
        const navBlocks = doc.querySelectorAll('.block_navigation, .block_tree, .block_course_list');
        navBlocks.forEach(block => {
            const courseItems = block.querySelectorAll('li, .tree_item');
            courseItems.forEach(item => {
                const courseLink = item.querySelector('a[href*="/course/view.php?id="]');
                if (courseLink) {
                    const href = courseLink.getAttribute('href');
                    const match = href.match(/id=(\d+)/);
                    if (match) {
                        const courseId = match[1];
                        if (!seenIds.has(courseId)) {
                            seenIds.add(courseId);
                            
                            let courseName = this.extractCourseName(item, courseLink);
                            
                            if (courseName && courseName.length > 2) {
                                const fullUrl = href.startsWith('http') ? href : 'https://mydy.dypatil.edu' + href;
                                courses.push({
                                    id: courseId,
                                    name: courseName,
                                    url: fullUrl
                                });
                            }
                        }
                    }
                }
            });
        });

        // Method 3: Look for table rows with course information
        const tableRows = doc.querySelectorAll('tr, .course-row');
        tableRows.forEach(row => {
            const courseLink = row.querySelector('a[href*="/course/view.php?id="]');
            if (courseLink) {
                const href = courseLink.getAttribute('href');
                const match = href.match(/id=(\d+)/);
                if (match) {
                    const courseId = match[1];
                    if (!seenIds.has(courseId)) {
                        seenIds.add(courseId);
                        
                        let courseName = this.extractCourseName(row, courseLink);
                        
                        if (courseName && courseName.length > 2) {
                            const fullUrl = href.startsWith('http') ? href : 'https://mydy.dypatil.edu' + href;
                            courses.push({
                                id: courseId,
                                name: courseName,
                                url: fullUrl
                            });
                        }
                    }
                }
            }
        });

        // Method 4: Fallback - scan all course links but with better name extraction
        if (courses.length === 0) {
            const allCourseLinks = doc.querySelectorAll('a[href*="/course/view.php?id="]');
            allCourseLinks.forEach(link => {
                const href = link.getAttribute('href');
                const match = href.match(/id=(\d+)/);
                if (match) {
                    const courseId = match[1];
                    if (!seenIds.has(courseId)) {
                        seenIds.add(courseId);
                        
                        const container = link.closest('tr, td, li, div, .course-item');
                        let courseName = this.extractCourseName(container || link.parentElement, link);
                        
                        if (courseName && courseName.length > 2) {
                            const fullUrl = href.startsWith('http') ? href : 'https://mydy.dypatil.edu' + href;
                            courses.push({
                                id: courseId,
                                name: courseName,
                                url: fullUrl
                            });
                        }
                    }
                }
            });
        }

        // Sort courses by ID (newer courses usually have higher IDs)
        courses.sort((a, b) => parseInt(b.id) - parseInt(a.id));

        console.log('Found courses:', courses);
        sendResponse({ courses: courses });
    }

    extractCourseName(container, courseLink) {
        if (!container) return null;
        
        // Try various selectors to find course name
        const nameSelectors = [
            '.coursename',
            '.course-title',
            '.course-name',
            'h3',
            'h4',
            'h5',
            '.title',
            '.name'
        ];
        
        // First try specific course name elements
        for (const selector of nameSelectors) {
            const element = container.querySelector(selector);
            if (element) {
                const text = element.textContent.trim();
                if (this.isValidCourseName(text)) {
                    return this.cleanCourseName(text);
                }
            }
        }
        
        // If link text is not "Launch", use it
        const linkText = courseLink.textContent.trim();
        if (this.isValidCourseName(linkText)) {
            return this.cleanCourseName(linkText);
        }
        
        // Look for text in adjacent cells (for table layouts)
        if (container.tagName === 'TR' || container.tagName === 'TD') {
            const cells = container.querySelectorAll('td, th');
            for (const cell of cells) {
                const text = cell.textContent.trim();
                if (this.isValidCourseName(text) && !cell.contains(courseLink)) {
                    return this.cleanCourseName(text);
                }
            }
        }
        
        // Look for any text content in the container that looks like a course name
        const allText = container.textContent.trim();
        const lines = allText.split('\n').map(line => line.trim()).filter(line => line);
        
        for (const line of lines) {
            if (this.isValidCourseName(line) && line !== linkText) {
                return this.cleanCourseName(line);
            }
        }
        
        // Try to find course name in title or alt attributes
        const titleElement = container.querySelector('[title], [alt]');
        if (titleElement) {
            const title = titleElement.getAttribute('title') || titleElement.getAttribute('alt');
            if (title && this.isValidCourseName(title)) {
                return this.cleanCourseName(title);
            }
        }
        
        return null;
    }
    
    isValidCourseName(text) {
        if (!text || typeof text !== 'string') return false;
        
        const cleaned = text.trim();
        
        // Reject common non-course text
        const invalidTexts = [
            'launch', 'click', 'view', 'open', 'go', 'enter', 'access',
            'dashboard', 'home', 'profile', 'settings', 'logout', 'login',
            'menu', 'navigation', 'back', 'forward', 'next', 'previous'
        ];
        
        if (invalidTexts.includes(cleaned.toLowerCase())) return false;
        
        // Must have reasonable length
        if (cleaned.length < 3 || cleaned.length > 200) return false;
        
        // Should not be just numbers or special characters
        if (/^[\d\s\-_\.]+$/.test(cleaned)) return false;
        
        // Should contain some letters
        if (!/[a-zA-Z]/.test(cleaned)) return false;
        
        return true;
    }
    
    cleanCourseName(text) {
        return text
            .replace(/\s+/g, ' ')  // Normalize whitespace
            .replace(/^[-\s]+|[-\s]+$/g, '')  // Remove leading/trailing dashes and spaces
            .trim();
    }

    // Send a structured progress message. background.js keeps the latest state of the run, so the
    // popup can show it again after being closed and reopened.
    //   phase:   'start' | 'scan' | 'download' | 'course-done' | 'done' | 'error'
    //   course:  { index, total, name } (1-based) or null when no course is active
    //   file:    { index, total, name } (1-based within the course) or null
    //   totals:  { downloaded, skipped, failed, found } running totals across all courses
    //   courses: course names (on 'start');  results: per-course results (on 'done')
    sendProgress(phase, status, { course = null, file = null, totals, courses, results } = {}) {
        const message = {
            action: 'updateProgress',
            phase,
            status,
            course,
            file,
            totals: {
                downloaded: totals ? totals.downloaded : 0,
                skipped: totals ? totals.skipped : 0,
                failed: totals ? totals.failed : 0,
                found: totals ? totals.found : 0
            }
        };
        if (courses) message.courses = courses;
        if (results) message.results = results;

        try {
            const pending = chrome.runtime.sendMessage(message);
            if (pending && typeof pending.catch === 'function') {
                pending.catch(() => {
                    // Nobody listening right now, ignore
                });
            }
        } catch (error) {
            // Extension context may be invalidated (e.g. reloaded mid-download), ignore
        }
    }

    pluralize(count, singular, plural) {
        return `${count} ${count === 1 ? singular : (plural || singular + 's')}`;
    }

    // ---- polite networking ----

    // Wait until REQUEST_GAP_MS has passed since the previous request to MyDy.
    async pace() {
        const wait = this.lastRequest + REQUEST_GAP_MS - Date.now();
        if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
        this.lastRequest = Date.now();
    }

    // Fetch a MyDy page as a parsed document. Unlike loading it in an iframe, this doesn't run the
    // page's scripts or load its images. If the address turns out to be a file (a resource that
    // redirects straight to its PDF), the body isn't read: its final address is returned so the file
    // is downloaded once, later.
    async fetchPage(url) {
        await this.pace();
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), PAGE_TIMEOUT_MS);
        try {
            const response = await fetch(url, { credentials: 'include', signal: controller.signal });
            const type = response.headers.get('content-type') || '';
            if (!type.includes('text/html')) {
                controller.abort();
                return { fileUrl: response.url };
            }
            if (!response.ok) throw new Error(`MyDy answered ${response.status}`);
            const html = await response.text();
            return { doc: new DOMParser().parseFromString(html, 'text/html'), url: response.url };
        } finally {
            clearTimeout(timer);
        }
    }

    absolute(value, base) {
        try {
            return new URL(value, base).href;
        } catch (error) {
            return null;
        }
    }

    // ---- downloading ----

    async handleDownloadCourses(courses, sendResponse) {
        if (this.running) {
            sendResponse({ error: 'A download is already running in this tab.' });
            return;
        }
        this.running = true;

        // Course/totals state lives outside the try block so the error handler can report it
        const totals = { downloaded: 0, skipped: 0, failed: 0, found: 0 };
        let activeCourse = null;
        const totalCourses = courses.length;
        const currentTotals = () => ({ ...totals });

        try {
            const results = [];

            this.sendProgress('start', `Scanning ${this.pluralize(totalCourses, 'course')}`, {
                totals: currentTotals(),
                courses: courses.map((course) => course.name)
            });

            for (let i = 0; i < courses.length; i++) {
                const course = courses[i];
                activeCourse = { index: i + 1, total: totalCourses, name: course.name };

                this.sendProgress('scan', `Opening ${course.name}`, {
                    course: activeCourse,
                    totals: currentTotals()
                });

                const result = await this.downloadCourse(course, i + 1, totalCourses, currentTotals());
                results.push(result);

                totals.found += result.totalFound;
                totals.downloaded += result.downloaded;
                totals.skipped += result.skipped;
                totals.failed += result.failed;

                let courseSummary;
                if (result.totalFound > 0) {
                    courseSummary = `Finished ${course.name}: ${result.downloaded} of ${result.totalFound} files`;
                    if (result.skipped > 0) courseSummary += `, ${result.skipped} already saved`;
                    if (result.failed > 0) courseSummary += `, ${result.failed} failed`;
                } else {
                    courseSummary = `Finished ${course.name}: no files`;
                }
                this.sendProgress('course-done', courseSummary, {
                    course: activeCourse,
                    totals: currentTotals()
                });
            }

            this.sendProgress(
                'done',
                `Finished: ${totals.downloaded} of ${totals.found} files from ${this.pluralize(totalCourses, 'course')}`,
                { totals: currentTotals(), results }
            );

            sendResponse({ success: true, results: results });
        } catch (error) {
            console.error('Download error:', error);
            this.sendProgress('error', `Download failed: ${error.message}`, {
                course: activeCourse,
                totals: currentTotals()
            });
            sendResponse({ error: error.message });
        } finally {
            this.running = false;
        }
    }

    async downloadCourse(course, courseNumber, totalCourses, baseTotals) {
        const result = {
            course: course.name,
            downloaded: 0,
            skipped: 0,
            failed: 0,
            files: [],
            totalFound: 0
        };

        // Running totals = totals before this course + this course's result so far
        const courseInfo = { index: courseNumber, total: totalCourses, name: course.name };
        const report = (phase, status, file = null) => {
            this.sendProgress(phase, status, {
                course: courseInfo,
                file: file,
                totals: {
                    downloaded: baseTotals.downloaded + result.downloaded,
                    skipped: baseTotals.skipped + result.skipped,
                    failed: baseTotals.failed + result.failed,
                    found: baseTotals.found + result.totalFound
                }
            });
        };

        try {
            const page = await this.fetchPage(course.url);
            if (!page.doc) throw new Error('that address is not a course page');

            report('scan', `Scanning ${course.name}`);
            const files = await this.findDownloadableFiles(page.doc, page.url, course.name, report);
            result.totalFound = files.length;
            report('scan', files.length ? `Found ${this.pluralize(files.length, 'file')} in ${course.name}` : `No files found in ${course.name}`);

            // One file at a time: downloadFile waits for each to finish before the next starts.
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const fileInfo = { index: i + 1, total: files.length, name: file.name };
                report('download', `Downloading ${file.name}`, fileInfo);

                const outcome = await this.downloadFile(file.url, file.name, course.name);
                if (outcome === 'skipped') {
                    result.skipped++;
                    report('download', `Already saved ${file.name}`, fileInfo);
                } else if (outcome === 'failed') {
                    result.failed++;
                    report('download', `Couldn't download ${file.name}`, fileInfo);
                } else {
                    result.downloaded++;
                    result.files.push(file.name);
                    report('download', `Downloaded ${file.name}`, fileInfo);
                }
            }
        } catch (error) {
            console.error('Course processing error:', error);
            result.failed++;
            report('scan', `Couldn't open ${course.name}: ${error.message}`);
        }
        return result;
    }

    // Files linked from a page: pluginfile links, direct document links, embedded viewers and
    // FlexPaper's PDFFile setting. Only files on MyDy itself.
    filesInPage(doc, base) {
        const files = [];
        const add = (raw, name) => {
            const url = raw && this.absolute(raw, base);
            if (!url || !url.startsWith(MYDY_ORIGIN)) return;
            files.push({ url, name: name || this.extractFilenameFromUrl(url), type: this.getFileType(url) });
        };
        doc.querySelectorAll('a[href*="pluginfile.php"], a[href$=".pdf"], a[href$=".ppt"], a[href$=".pptx"], a[href$=".doc"], a[href$=".docx"], a[href$=".txt"]')
            .forEach((link) => add(link.getAttribute('href'), link.textContent.trim()));
        doc.querySelectorAll('iframe[src*="pluginfile.php"]').forEach((frame) => add(frame.getAttribute('src')));
        doc.querySelectorAll('object[data*="pluginfile.php"]').forEach((object) => add(object.getAttribute('data')));
        doc.querySelectorAll('script').forEach((script) => {
            for (const match of script.textContent.matchAll(/PDFFile\s*:\s*'([^']+)'/g)) add(match[1]);
        });
        return files;
    }

    async findDownloadableFiles(doc, courseUrl, courseName, report = () => {}) {
        const files = [];
        const seenUrls = new Set();
        const keep = (list) => list.forEach((file) => {
            if (!seenUrls.has(file.url)) {
                seenUrls.add(file.url);
                files.push(file);
            }
        });

        keep(this.filesInPage(doc, courseUrl));

        // Activities that hold files. Each is listed once, even when the page links it twice.
        const activities = [...new Set(
            Array.from(doc.querySelectorAll('a[href*="/mod/"]'))
                .map((link) => this.absolute(link.getAttribute('href'), courseUrl))
                .filter((href) => href && href.startsWith(MYDY_ORIGIN) && ACTIVITY_TYPES.some((type) => href.includes(`/mod/${type}/`)))
        )];

        for (let i = 0; i < activities.length; i++) {
            report('scan', `Scanning activity ${i + 1} of ${activities.length} in ${courseName}`);
            try {
                const page = await this.fetchPage(activities[i]);
                if (page.fileUrl) {
                    keep([{ url: page.fileUrl, name: this.extractFilenameFromUrl(page.fileUrl), type: this.getFileType(page.fileUrl) }]);
                } else {
                    keep(this.filesInPage(page.doc, page.url));
                }
            } catch (error) {
                console.warn('Could not scan activity:', activities[i], error);
            }
        }

        return files;
    }

    extractFilenameFromUrl(url) {
        try {
            const urlObj = new URL(url);
            const pathname = urlObj.pathname;
            const filename = decodeURIComponent(pathname.split('/').pop());
            return filename || 'unknown_file';
        } catch (error) {
            return 'unknown_file';
        }
    }

    getFileType(url) {
        const extension = url.split('?')[0].split('.').pop().toLowerCase();
        const typeMap = {
            'pdf': 'pdf',
            'ppt': 'presentation',
            'pptx': 'presentation',
            'doc': 'document',
            'docx': 'document',
            'txt': 'text'
        };
        return typeMap[extension] || 'unknown';
    }

    // Returns 'downloaded', 'skipped' (already saved) or 'failed'.
    async downloadFile(url, filename, courseName) {
        await this.pace();
        let response;
        try {
            // background.js saves into Downloads/MyDy/<course>/ and answers once the file has finished.
            response = await chrome.runtime.sendMessage({ action: 'downloadFile', url, filename, courseName });
        } catch (error) {
            // The worker may have restarted mid-download; don't start a second copy.
            console.warn('Download status unknown:', error);
            return 'failed';
        }
        if (response && response.success) {
            if (response.state === 'skipped') return 'skipped';
            return response.state === 'interrupted' ? 'failed' : 'downloaded';
        }

        // The worker couldn't start it: let the page download it (lands in the Downloads folder itself).
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return 'downloaded';
    }
}

// Initialize the content script
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        new MydyContentScript();
    });
} else {
    new MydyContentScript();
}