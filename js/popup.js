class MydyExtension {
    constructor() {
        this.courses = [];
        this.downloadResults = [];
        this.isLoggedIn = false;
        this.selectedCourses = new Set();
        this.init();
    }

    init() {
        this.bindEvents();
        this.checkLoginStatus();
        
        // Set up message listener for progress updates
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.action === 'updateProgress') {
                this.updateProgress(message.percentage, message.status, message.downloadedFile);
            }
        });
    }

    bindEvents() {
        // Login status check
        document.getElementById('checkLoginBtn').addEventListener('click', () => this.checkLoginStatus());

        // Course selection
        document.getElementById('downloadAllBtn').addEventListener('click', () => this.downloadCourses('all'));
        document.getElementById('downloadSelectedBtn').addEventListener('click', () => this.downloadCourses('selected'));
        document.getElementById('refreshCoursesBtn').addEventListener('click', () => this.loadCourses());

        // Reset and retry - both should do the same thing: reset and check login
        document.getElementById('resetBtn').addEventListener('click', () => this.reset());
        document.getElementById('retryBtn').addEventListener('click', () => this.retry());
        
        // Search functionality
        document.getElementById('courseSearchInput').addEventListener('input', (e) => this.filterCourses(e.target.value));
        document.getElementById('clearSearchBtn').addEventListener('click', () => this.clearSearch());
    }

    async checkLoginStatus() {
        try {
            // Add loading state to button
            const checkBtn = document.getElementById('checkLoginBtn');
            checkBtn.classList.add('loading');
            checkBtn.textContent = 'Checking...';
            
            // Check if user is already logged in by sending a message to content script
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tabs[0] && tabs[0].url.includes('mydy.dypatil.edu')) {
                const response = await this.sendMessageWithTimeout(tabs[0].id, { action: 'checkLogin' }, 5000);
                if (response && response.loggedIn) {
                    this.isLoggedIn = true;
                    this.loadCourses();
                } else {
                    this.showSection('notLoggedInSection');
                }
            } else {
                this.showError('Please navigate to MyDY Moodle (https://mydy.dypatil.edu) first, then login and return to this extension.');
            }
        } catch (error) {
            console.error('Check login error:', error);
            this.showError('Please navigate to MyDY Moodle, login, and then try again.');
        } finally {
            // Reset button state
            const checkBtn = document.getElementById('checkLoginBtn');
            checkBtn.classList.remove('loading');
            checkBtn.innerHTML = '<span class="btn-text">Check Login Status</span>';
        }
    }

    async sendMessageWithTimeout(tabId, message, timeout = 10000) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error('Message timeout'));
            }, timeout);

            chrome.tabs.sendMessage(tabId, message, (response) => {
                clearTimeout(timer);
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve(response);
                }
            });
        });
    }

    async loadCourses() {
        try {
            this.showSection('coursesSection');
            
            // Add loading state to refresh button
            const refreshBtn = document.getElementById('refreshCoursesBtn');
            refreshBtn.classList.add('loading');
            refreshBtn.innerHTML = '<span class="btn-icon">⏳</span>Loading...';
            
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            const response = await this.sendMessageWithTimeout(tabs[0].id, { action: 'getCourses' }, 15000);

            if (response && response.courses) {
                this.courses = response.courses;
                this.displayCourses();
            } else if (response && response.error) {
                this.showError('Failed to load courses: ' + response.error);
            } else {
                this.showError('Failed to load courses. You might not be enrolled in any courses this semester.');
            }
        } catch (error) {
            console.error('Load courses error:', error);
            this.showError('Failed to load courses: ' + error.message);
        } finally {
            // Reset refresh button
            const refreshBtn = document.getElementById('refreshCoursesBtn');
            refreshBtn.classList.remove('loading');
            refreshBtn.innerHTML = '<span class="btn-icon">🔄</span>Refresh';
        }
    }

    displayCourses() {
        const coursesList = document.getElementById('coursesList');
        coursesList.innerHTML = '';

        if (this.courses.length === 0) {
            coursesList.innerHTML = '<div class="empty-state"><p>No courses found. This might be normal between semesters.</p></div>';
            return;
        }

        this.courses.forEach((course, index) => {
            const courseItem = document.createElement('div');
            courseItem.className = 'course-item';
            courseItem.dataset.courseId = course.id;
            
            courseItem.innerHTML = `
                <div class="course-checkbox" data-course-id="${course.id}">
                </div>
                <div class="course-name">${course.name}</div>
            `;
            
            // Add click handler for course selection
            courseItem.addEventListener('click', (e) => {
                e.preventDefault();
                this.toggleCourseSelection(course.id, courseItem);
            });
            
            coursesList.appendChild(courseItem);
        });

        this.updateDownloadButtons();
    }

    toggleCourseSelection(courseId, courseItem) {
        const checkbox = courseItem.querySelector('.course-checkbox');
        
        if (this.selectedCourses.has(courseId)) {
            this.selectedCourses.delete(courseId);
            checkbox.classList.remove('checked');
            courseItem.classList.remove('selected');
        } else {
            this.selectedCourses.add(courseId);
            checkbox.classList.add('checked');
            courseItem.classList.add('selected');
        }
        
        this.updateDownloadButtons();
    }

    updateDownloadButtons() {
        const downloadSelectedBtn = document.getElementById('downloadSelectedBtn');
        const hasSelection = this.selectedCourses.size > 0;
        
        downloadSelectedBtn.disabled = !hasSelection;
        downloadSelectedBtn.textContent = hasSelection 
            ? `Download Selected (${this.selectedCourses.size})` 
            : 'Download Selected';
    }

    async downloadCourses(type) {
        let selectedCourses = [];

        if (type === 'all') {
            selectedCourses = this.courses;
        } else {
            if (this.selectedCourses.size === 0) {
                this.showError('Please select at least one course to download');
                return;
            }
            
            selectedCourses = this.courses.filter(course => this.selectedCourses.has(course.id));
        }

        this.showSection('progressSection');
        this.updateProgress('Initializing download...');

        try {
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            
            // Start download process
            const response = await this.sendMessageWithTimeout(tabs[0].id, {
                action: 'downloadCourses',
                courses: selectedCourses
            }, 300000); // 5 minute timeout for downloads

            if (response && response.success) {
                this.downloadResults = response.results;
                this.showResults();
            } else {
                this.showError(response?.error || 'Download failed');
            }
        } catch (error) {
            console.error('Download error:', error);
            this.showError('Download failed: ' + error.message);
        }
    }

    updateProgress(status, downloadedFile = null) {
        const statusText = document.getElementById('statusText');
        
        if (statusText) {
            statusText.textContent = status; // Use textContent to avoid HTML injection
        }

        // For the simplified loading animation, we don't need progress bars
        // Just update the status text to show what's happening
        
        if (downloadedFile) {
            // You can still track downloaded files if needed
            console.log('Downloaded:', downloadedFile);
        }
    }

    showResults() {
        this.showSection('resultsSection');
        
        const totalFiles = this.downloadResults.reduce((sum, result) => sum + result.downloaded, 0);
        const totalFailed = this.downloadResults.reduce((sum, result) => sum + result.failed, 0);
        const totalCourses = this.downloadResults.length;
        
        const summaryText = document.getElementById('summaryText');
        if (summaryText) {
            summaryText.innerHTML = `
                <div class="stat-item">
                    <div class="stat-number">${totalCourses}</div>
                    <div class="stat-label">Courses</div>
                </div>
                <div class="stat-item">
                    <div class="stat-number">${totalFiles}</div>
                    <div class="stat-label">Files Downloaded</div>
                </div>
                ${totalFailed > 0 ? `
                <div class="stat-item">
                    <div class="stat-number">${totalFailed}</div>
                    <div class="stat-label">Failed</div>
                </div>` : ''}
            `;
        }

        // Show file list
        const filesList = document.getElementById('filesList');
        if (filesList) {
            filesList.innerHTML = '';
            
            this.downloadResults.forEach(result => {
                if (result.files && result.files.length > 0) {
                    // Create course header
                    const courseHeader = document.createElement('div');
                    courseHeader.className = 'course-header';
                    courseHeader.innerHTML = `
                        <h4>${result.course}</h4>
                        <span class="file-count">${result.downloaded} files</span>
                    `;
                    filesList.appendChild(courseHeader);
                    
                    // Add files
                    result.files.forEach(file => {
                        const fileItem = document.createElement('div');
                        fileItem.className = 'file-item';
                        fileItem.textContent = file;
                        filesList.appendChild(fileItem);
                    });
                }
            });
        }
    }

    showError(message) {
        this.showSection('errorSection');
        const errorText = document.getElementById('errorText');
        if (errorText) {
            errorText.textContent = message;
        }
    }

    showSection(sectionId) {
        // Hide all sections
        document.querySelectorAll('.section').forEach(section => {
            section.classList.add('hidden');
        });
        
        // Show target section with animation
        const targetSection = document.getElementById(sectionId);
        if (targetSection) {
            targetSection.classList.remove('hidden');
        }
    }

    reset() {
        this.courses = [];
        this.downloadResults = [];
        this.selectedCourses.clear();
        this.isLoggedIn = false;
        
        // Reset progress display
        this.updateProgress('Ready');
        const downloadedFiles = document.getElementById('downloadedFiles');
        if (downloadedFiles) {
            downloadedFiles.innerHTML = '';
        }
        
        // Check login status again
        this.checkLoginStatus();
    }

    async retry() {
        // Add loading state to retry button
        const retryBtn = document.getElementById('retryBtn');
        const originalText = retryBtn.innerHTML;
        retryBtn.classList.add('loading');
        retryBtn.textContent = 'Refreshing page...';
        
        try {
            // Get the current active tab and refresh it
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tabs[0]) {
                await chrome.tabs.reload(tabs[0].id);
                
                // Wait a moment for the page to start reloading, then close popup
                setTimeout(() => {
                    window.close();
                }, 500);
            } else {
                // Fallback: reset extension state if tab refresh fails
                this.resetExtensionState();
            }
        } catch (error) {
            console.error('Failed to refresh page:', error);
            // Fallback: reset extension state
            this.resetExtensionState();
        }
    }
    
    resetExtensionState() {
        // Reset state and check login again (original retry behavior)
        this.courses = [];
        this.downloadResults = [];
        this.selectedCourses.clear();
        this.isLoggedIn = false;
        
        // Clear any existing progress
        const downloadedFiles = document.getElementById('downloadedFiles');
        if (downloadedFiles) {
            downloadedFiles.innerHTML = '';
        }
        
        // Reset button state
        const retryBtn = document.getElementById('retryBtn');
        retryBtn.classList.remove('loading');
        retryBtn.innerHTML = 'Try Again';
        
        // Try to check login status again
        this.checkLoginStatus();
    }

    filterCourses(query) {
        const normalizedQuery = query.toLowerCase();
        
        // Filter courses based on the search query
        const filteredCourses = this.courses.filter(course => 
            course.name.toLowerCase().includes(normalizedQuery)
        );
        
        this.displayFilteredCourses(filteredCourses);
    }

    displayFilteredCourses(filteredCourses) {
        const coursesList = document.getElementById('coursesList');
        coursesList.innerHTML = '';

        if (filteredCourses.length === 0) {
            coursesList.innerHTML = '<div class="empty-state"><p>No courses found matching your search.</p></div>';
            return;
        }

        filteredCourses.forEach((course, index) => {
            const courseItem = document.createElement('div');
            courseItem.className = 'course-item';
            courseItem.dataset.courseId = course.id;
            
            courseItem.innerHTML = `
                <div class="course-checkbox" data-course-id="${course.id}">
                </div>
                <div class="course-name">${course.name}</div>
            `;
            
            // Add click handler for course selection
            courseItem.addEventListener('click', (e) => {
                e.preventDefault();
                this.toggleCourseSelection(course.id, courseItem);
            });
            
            coursesList.appendChild(courseItem);
        });

        this.updateDownloadButtons();
    }

    clearSearch() {
        const searchInput = document.getElementById('courseSearchInput');
        searchInput.value = '';
        
        // Clear filter and show all courses
        this.displayCourses();
    }
}

// Initialize extension when popup opens
document.addEventListener('DOMContentLoaded', () => {
    window.mydyExtension = new MydyExtension();
});