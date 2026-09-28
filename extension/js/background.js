class MydyBackground {
    constructor() {
        this.init();
    }

    init() {
        // Which MyDy/<course> folder each download we started belongs in.
        this.folderForUrl = new Map();
        this.folderForId = new Map();
        this.setupMessageListener();
        this.setupDownloadListener();
    }

    setupMessageListener() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.action === 'downloadFile') {
                this.handleDownloadFile(message, sendResponse);
                return true; // Keep message channel open for async response
            }
            // Progress messages from content.js reach the popup directly; nothing to relay.
            return false;
        });
    }

    handleDownloadFile(message, sendResponse) {
        // Download through Chrome so the server's file name (with its extension) is kept, and put it in
        // MyDy/<course>/ when Chrome settles the name (see onDeterminingFilename below).
        const folder = `MyDy/${this.sanitizeFilename(message.courseName || 'Course')}`;
        this.folderForUrl.set(message.url, folder);
        chrome.downloads.download({ url: message.url, saveAs: false }, (downloadId) => {
            if (chrome.runtime.lastError || downloadId === undefined) {
                this.folderForUrl.delete(message.url);
                sendResponse({ success: false, error: chrome.runtime.lastError?.message || 'Download did not start' });
                return;
            }
            this.folderForId.set(downloadId, folder);
            sendResponse({ success: true, downloadId });
        });
    }

    setupDownloadListener() {
        chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
            const folder = this.folderForId.get(item.id) || this.folderForUrl.get(item.url);
            if (!folder) {
                suggest();
                return;
            }
            this.folderForId.delete(item.id);
            this.folderForUrl.delete(item.url);
            const name = this.sanitizeFilename(item.filename.split(/[\\/]/).pop());
            suggest({ filename: `${folder}/${name}`, conflictAction: 'uniquify' });
        });
    }

    sanitizeFilename(filename) {
        // Only replace characters that are illegal in filenames; keep spaces as-is
        const cleaned = String(filename == null ? '' : filename)
            .replace(/[<>:"/\\|?*]/g, '_')
            .replace(/[\u0000-\u001f\u007f]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .replace(/[. ]+$/, '');
        return cleaned || 'file';
    }
}

// Initialize background script
const mydyBackground = new MydyBackground();

// Handle extension installation
chrome.runtime.onInstalled.addListener(() => {
    console.log('MyDy Downloader installed');
});