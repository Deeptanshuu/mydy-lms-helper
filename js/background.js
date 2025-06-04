class MydyBackground {
    constructor() {
        this.init();
    }

    init() {
        this.setupMessageListener();
        this.setupDownloadListener();
    }

    setupMessageListener() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.action === 'downloadFile') {
                this.handleDownloadFile(message, sendResponse);
                return true; // Keep message channel open for async response
            }
            
            // Forward progress updates to popup if it's open
            if (message.action === 'updateProgress') {
                this.forwardToPopup(message);
                // Don't call sendResponse for progress updates as they don't expect a response
                return false;
            }
            
            return false; // Close message channel for other messages
        });
    }

    async handleDownloadFile(message, sendResponse) {
        try {
            // Create a proper filename with course folder structure
            const sanitizedCourseName = this.sanitizeFilename(message.courseName || 'Course');
            const sanitizedFilename = this.sanitizeFilename(message.filename);
            const fullPath = `MyDY_Downloads/${sanitizedCourseName}/${sanitizedFilename}`;
            
            // Handle file downloads using Chrome's downloads API
            chrome.downloads.download({
                url: message.url,
                filename: fullPath,
                conflictAction: 'uniquify', // Automatically rename if file exists
                saveAs: false // Auto-save to default downloads folder
            }, (downloadId) => {
                if (chrome.runtime.lastError) {
                    console.error('Download failed:', chrome.runtime.lastError);
                    sendResponse({ success: false, error: chrome.runtime.lastError.message });
                } else {
                    console.log('Download started:', downloadId, fullPath);
                    sendResponse({ success: true, downloadId: downloadId });
                }
            });
        } catch (error) {
            console.error('Download setup failed:', error);
            sendResponse({ success: false, error: error.message });
        }
    }

    setupDownloadListener() {
        // Listen for download events
        chrome.downloads.onCreated.addListener((downloadItem) => {
            console.log('Download started:', downloadItem.filename);
        });

        chrome.downloads.onChanged.addListener((delta) => {
            if (delta.state && delta.state.current === 'complete') {
                console.log('Download completed:', delta.id);
            } else if (delta.state && delta.state.current === 'interrupted') {
                console.log('Download failed:', delta.id);
            }
        });
    }

    async downloadFile(url, filename) {
        try {
            // Sanitize filename
            const sanitizedFilename = this.sanitizeFilename(filename);
            
            // Create download
            const downloadId = await chrome.downloads.download({
                url: url,
                filename: sanitizedFilename,
                conflictAction: 'uniquify', // Automatically rename if file exists
                saveAs: false // Don't show save dialog
            });

            return downloadId;
        } catch (error) {
            console.error('Download failed:', error);
            throw error;
        }
    }

    sanitizeFilename(filename) {
        // Remove or replace invalid characters
        return filename
            .replace(/[<>:"/\\|?*]/g, '_')
            .replace(/\s+/g, '_')
            .trim();
    }

    forwardToPopup(message) {
        // Try to send message to popup
        chrome.runtime.sendMessage(message).catch(() => {
            // Popup might be closed, ignore the error
        });
    }
}

// Initialize background script
const mydyBackground = new MydyBackground();

// Handle extension installation
chrome.runtime.onInstalled.addListener(() => {
    console.log('MyDY Moodle Downloader extension installed');
});