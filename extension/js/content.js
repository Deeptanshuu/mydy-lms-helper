class MydyContentScript {
    constructor() {
        this.isLoggedIn = false;
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

            // Navigate to dashboard if not already there
            if (!window.location.href.includes('/my/') && !window.location.href.includes('/course/')) {
                window.location.href = 'https://mydy.dypatil.edu/rait/my/';
                // Wait for page to load
                setTimeout(() => {
                    this.getCourses(sendResponse);
                }, 3000);
            } else {
                this.getCourses(sendResponse);
            }
        } catch (error) {
            console.error('Error getting courses:', error);
            sendResponse({ error: error.message });
        }
    }

    getCourses(sendResponse) {
        const courses = [];
        const seenIds = new Set();

        // Method 1: Look for course cards/boxes with proper structure
        const courseContainers = document.querySelectorAll('.coursebox, .course-info-container, .course-listitem');
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
        const navBlocks = document.querySelectorAll('.block_navigation, .block_tree, .block_course_list');
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
        const tableRows = document.querySelectorAll('tr, .course-row');
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
            const allCourseLinks = document.querySelectorAll('a[href*="/course/view.php?id="]');
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

    // Send a structured progress message to the popup (relayed by background.js).
    //   phase:  'scan' | 'download' | 'course-done' | 'done' | 'error'
    //   course: { index, total, name } (1-based) or null when no course is active
    //   file:   { index, total, name } (1-based within the course) or null
    //   totals: { downloaded, failed, found } running totals across all courses
    sendProgress(phase, status, { course = null, file = null, totals } = {}) {
        const message = {
            action: 'updateProgress',
            phase: phase,
            status: status,
            course: course,
            file: file,
            totals: {
                downloaded: totals ? totals.downloaded : 0,
                failed: totals ? totals.failed : 0,
                found: totals ? totals.found : 0
            }
        };

        try {
            const pending = chrome.runtime.sendMessage(message);
            if (pending && typeof pending.catch === 'function') {
                pending.catch(() => {
                    // Popup/background might not be listening, ignore
                });
            }
        } catch (error) {
            // Extension context may be invalidated (e.g. reloaded mid-download), ignore
        }
    }

    pluralize(count, singular, plural) {
        return `${count} ${count === 1 ? singular : (plural || singular + 's')}`;
    }

    async handleDownloadCourses(courses, sendResponse) {
        // Course/totals state lives outside the try block so the error handler can report it
        let totalFilesFound = 0;
        let totalFilesDownloaded = 0;
        let totalFilesFailed = 0;
        let activeCourse = null;
        const totalCourses = courses.length;
        const currentTotals = () => ({
            downloaded: totalFilesDownloaded,
            failed: totalFilesFailed,
            found: totalFilesFound
        });

        try {
            const results = [];
            let currentCourse = 0;

            // Initial progress update
            this.sendProgress('scan', `Scanning ${this.pluralize(totalCourses, 'course')}`, {
                totals: currentTotals()
            });

            for (const course of courses) {
                currentCourse++;
                activeCourse = { index: currentCourse, total: totalCourses, name: course.name };

                // Update progress for course scanning
                this.sendProgress('scan', `Opening ${course.name}`, {
                    course: activeCourse,
                    totals: currentTotals()
                });

                const result = await this.downloadCourse(course, currentCourse, totalCourses, currentTotals());
                results.push(result);

                totalFilesFound += result.totalFound || 0;
                totalFilesDownloaded += result.downloaded;
                totalFilesFailed += result.failed;

                // Update progress after each course
                let courseSummary;
                if (result.totalFound > 0) {
                    courseSummary = `Finished ${course.name}: ${result.downloaded} of ${result.totalFound} files`;
                    if (result.failed > 0) {
                        courseSummary += `, ${result.failed} failed`;
                    }
                } else {
                    courseSummary = `Finished ${course.name}: no files`;
                }
                this.sendProgress('course-done', courseSummary, {
                    course: activeCourse,
                    totals: currentTotals()
                });
            }

            // Final summary update
            this.sendProgress(
                'done',
                `Finished: ${totalFilesDownloaded} of ${totalFilesFound} files from ${this.pluralize(totalCourses, 'course')}`,
                { totals: currentTotals() }
            );

            sendResponse({ success: true, results: results });
        } catch (error) {
            console.error('Download error:', error);
            this.sendProgress('error', `Download failed: ${error.message}`, {
                course: activeCourse,
                totals: currentTotals()
            });
            sendResponse({ error: error.message });
        }
    }

    async downloadCourse(course, courseNumber, totalCourses, baseTotals = { downloaded: 0, failed: 0, found: 0 }) {
        return new Promise((resolve) => {
            // Create an iframe to load the course page
            const iframe = document.createElement('iframe');
            iframe.style.display = 'none';
            iframe.src = course.url;
            
            const result = {
                course: course.name,
                downloaded: 0,
                failed: 0,
                files: [],
                totalFound: 0
            };

            // Progress reporting for this course: running totals = totals before this course + this course's result so far
            const courseInfo = { index: courseNumber, total: totalCourses, name: course.name };
            const report = (phase, status, file = null) => {
                this.sendProgress(phase, status, {
                    course: courseInfo,
                    file: file,
                    totals: {
                        downloaded: baseTotals.downloaded + result.downloaded,
                        failed: baseTotals.failed + result.failed,
                        found: baseTotals.found + result.totalFound
                    }
                });
            };

            // Add timeout for course loading
            const timeout = setTimeout(() => {
                report('scan', `Timed out loading ${course.name}, skipped`);
                document.body.removeChild(iframe);
                resolve(result);
            }, 30000); // 30 second timeout

            iframe.onload = async () => {
                clearTimeout(timeout);
                
                try {
                    const doc = iframe.contentDocument || iframe.contentWindow.document;
                    
                    // First, find all downloadable files
                    report('scan', `Scanning ${course.name}`);

                    const downloadableFiles = await this.findDownloadableFiles(doc, course.name, report);
                    result.totalFound = downloadableFiles.length;
                    
                    if (downloadableFiles.length === 0) {
                        report('scan', `No files found in ${course.name}`);
                    } else {
                        report('scan', `Found ${this.pluralize(downloadableFiles.length, 'file')} in ${course.name}`);

                        // Download each file with progress updates
                        for (let i = 0; i < downloadableFiles.length; i++) {
                            const file = downloadableFiles[i];
                            const fileInfo = { index: i + 1, total: downloadableFiles.length, name: file.name };
                            
                            try {
                                report('download', `Downloading ${file.name}`, fileInfo);

                                await this.downloadFile(file.url, file.name, course.name);
                                result.downloaded++;
                                result.files.push(file.name);
                                
                                // Update progress with downloaded file
                                report('download', `Downloaded ${file.name}`, fileInfo);

                                // Small delay to prevent overwhelming the browser
                                await new Promise(resolve => setTimeout(resolve, 300));
                                
                            } catch (error) {
                                console.error('File download failed:', error);
                                result.failed++;
                                report('download', `Couldn't download ${file.name}`, fileInfo);
                            }
                        }
                    }
                } catch (error) {
                    console.error('Course processing error:', error);
                    result.failed++;
                    report('scan', `Couldn't process ${course.name}: ${error.message}`);
                }
                
                document.body.removeChild(iframe);
                resolve(result);
            };

            iframe.onerror = () => {
                clearTimeout(timeout);
                result.failed++;
                report('scan', `Couldn't load ${course.name}, skipped`);
                document.body.removeChild(iframe);
                resolve(result);
            };

            document.body.appendChild(iframe);
        });
    }

    async findDownloadableFiles(doc, courseName, report = () => {}) {
        const files = [];
        const seenUrls = new Set();

        // Look for different types of downloadable content
        const selectors = [
            'a[href*="pluginfile.php"]',
            'a[href$=".pdf"]',
            'a[href$=".ppt"]', 
            'a[href$=".pptx"]',
            'a[href$=".docx"]',
            'a[href$=".doc"]',
            'a[href$=".txt"]',
            'iframe[src*="pluginfile.php"]',
            'object[data*="pluginfile.php"]'
        ];

        // Count activity links first
        const activityLinks = doc.querySelectorAll('a[href*="/mod/"]');
        const relevantActivities = Array.from(activityLinks).filter(link => 
            link.href.includes('/mod/resource/') || 
            link.href.includes('/mod/flexpaper/') || 
            link.href.includes('/mod/presentation/') ||
            link.href.includes('/mod/casestudy/') ||
            link.href.includes('/mod/dyquestion/')
        );

        selectors.forEach(selector => {
            const elements = doc.querySelectorAll(selector);
            elements.forEach(element => {
                let url = null;
                let filename = null;

                if (element.tagName === 'A') {
                    url = element.href;
                    filename = element.textContent.trim() || this.extractFilenameFromUrl(url);
                } else if (element.tagName === 'IFRAME') {
                    url = element.src;
                    filename = this.extractFilenameFromUrl(url);
                } else if (element.tagName === 'OBJECT') {
                    url = element.data;
                    filename = this.extractFilenameFromUrl(url);
                }

                if (url && !seenUrls.has(url)) {
                    seenUrls.add(url);
                    // Ensure URL is absolute
                    if (!url.startsWith('http')) {
                        url = 'https://mydy.dypatil.edu' + url;
                    }
                    
                    files.push({
                        url: url,
                        name: filename || 'unknown_file',
                        type: this.getFileType(url)
                    });
                }
            });
        });

        // Look for activity links that might contain files
        for (let i = 0; i < relevantActivities.length; i++) {
            const link = relevantActivities[i];
            const href = link.href;
            
            report('scan', `Scanning activity ${i + 1} of ${relevantActivities.length} in ${courseName}`);
            
            try {
                const activityFiles = await this.scanActivityForFiles(href);
                activityFiles.forEach(file => {
                    if (!seenUrls.has(file.url)) {
                        seenUrls.add(file.url);
                        files.push(file);
                    }
                });
            } catch (error) {
                console.error('Error scanning activity:', error);
            }
        }

        return files;
    }

    async scanActivityForFiles(activityUrl) {
        return new Promise((resolve) => {
            const iframe = document.createElement('iframe');
            iframe.style.display = 'none';
            iframe.src = activityUrl;
            
            const files = [];

            iframe.onload = () => {
                try {
                    const doc = iframe.contentDocument || iframe.contentWindow.document;
                    
                    // Look for direct download links
                    const downloadLinks = doc.querySelectorAll('a[href*="pluginfile.php"], a[href$=".pdf"], a[href$=".ppt"], a[href$=".pptx"]');
                    downloadLinks.forEach(link => {
                        let url = link.href;
                        if (!url.startsWith('http')) {
                            url = 'https://mydy.dypatil.edu' + url;
                        }
                        files.push({
                            url: url,
                            name: link.textContent.trim() || this.extractFilenameFromUrl(url),
                            type: this.getFileType(url)
                        });
                    });

                    // Look for FlexPaper PDFs in script content
                    const scripts = doc.querySelectorAll('script');
                    scripts.forEach(script => {
                        const content = script.textContent;
                        const pdfMatches = content.match(/PDFFile\s*:\s*'([^']+)'/g);
                        if (pdfMatches) {
                            pdfMatches.forEach(match => {
                                const urlMatch = match.match(/'([^']+)'/);
                                if (urlMatch) {
                                    let url = urlMatch[1];
                                    if (!url.startsWith('http')) {
                                        url = 'https://mydy.dypatil.edu' + url;
                                    }
                                    files.push({
                                        url: url,
                                        name: this.extractFilenameFromUrl(url),
                                        type: 'pdf'
                                    });
                                }
                            });
                        }
                    });

                    // Look for iframe and object sources
                    const iframes = doc.querySelectorAll('iframe[src*="pluginfile.php"]');
                    iframes.forEach(iframe => {
                        let url = iframe.src;
                        if (!url.startsWith('http')) {
                            url = 'https://mydy.dypatil.edu' + url;
                        }
                        files.push({
                            url: url,
                            name: this.extractFilenameFromUrl(url),
                            type: this.getFileType(url)
                        });
                    });

                    const objects = doc.querySelectorAll('object[data*="pluginfile.php"]');
                    objects.forEach(obj => {
                        let url = obj.data;
                        if (!url.startsWith('http')) {
                            url = 'https://mydy.dypatil.edu' + url;
                        }
                        files.push({
                            url: url,
                            name: this.extractFilenameFromUrl(url),
                            type: this.getFileType(url)
                        });
                    });

                } catch (error) {
                    console.error('Error accessing activity iframe:', error);
                }
                
                document.body.removeChild(iframe);
                resolve(files);
            };

            iframe.onerror = () => {
                document.body.removeChild(iframe);
                resolve([]);
            };

            document.body.appendChild(iframe);
        });
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
        const extension = url.split('.').pop().toLowerCase();
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

    async downloadFile(url, filename, courseName) {
        // Prefer the background worker: it saves into Downloads/MyDy/<course>/.
        try {
            const response = await chrome.runtime.sendMessage({ action: 'downloadFile', url, filename, courseName });
            if (response && response.success) {
                await new Promise((resolve) => setTimeout(resolve, 300));
                return;
            }
        } catch (error) {
            console.warn('Background download failed, using a page link instead:', error);
        }

        // Fallback: let the page download it (lands in the Downloads folder itself).
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        await new Promise((resolve) => setTimeout(resolve, 500));
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