// MyDy Extension service worker.
// - Saves files for content.js into Downloads/MyDy/<course>/, one at a time.
// - Keeps the latest state of a download run in chrome.storage.session, so the popup can show it again
//   after being closed, and mirrors it on the toolbar icon's badge.

const RUN_KEY = 'run';
// How long to wait for one file before moving on to the next (it keeps downloading either way).
const DOWNLOAD_WAIT_MS = 5 * 60 * 1000;

class MydyBackground {
    constructor() {
        // Which MyDy/<course> folder each download we started belongs in.
        this.folderForUrl = new Map();
        this.folderForId = new Map();
        // Progress updates are applied in order, one at a time.
        this.saving = Promise.resolve();

        this.setupMessageListener();
        this.setupDownloadListener();
        this.setupTabListeners();
    }

    setupMessageListener() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.action === 'downloadFile') {
                this.handleDownloadFile(message, sendResponse);
                return true; // answered once the file has finished
            }
            if (message.action === 'updateProgress' && sender.tab) {
                this.recordProgress(message, sender.tab.id);
            }
            return false;
        });
    }

    // ---- downloads ----

    async handleDownloadFile(message, sendResponse) {
        const folder = `MyDy/${this.sanitizeFilename(message.courseName || 'Course')}`;
        try {
            // Like the terminal app: don't fetch a file again if it was saved before and is still there.
            const [previous] = await chrome.downloads.search({ url: message.url, state: 'complete', exists: true, limit: 1 });
            if (previous) {
                sendResponse({ success: true, state: 'skipped' });
                return;
            }

            this.folderForUrl.set(message.url, folder);
            const downloadId = await chrome.downloads.download({ url: message.url, saveAs: false });
            this.folderForId.set(downloadId, folder);
            const state = await this.waitForDownload(downloadId);
            sendResponse({ success: true, state, downloadId });
        } catch (error) {
            this.folderForUrl.delete(message.url);
            sendResponse({ success: false, error: error.message });
        }
    }

    // Resolves with 'complete', 'interrupted' or 'timeout'.
    waitForDownload(id) {
        return new Promise((resolve) => {
            let settled = false;
            const finish = (state) => {
                if (settled) return;
                settled = true;
                chrome.downloads.onChanged.removeListener(onChanged);
                clearTimeout(timer);
                resolve(state);
            };
            const onChanged = (delta) => {
                if (delta.id === id && delta.state && delta.state.current !== 'in_progress') finish(delta.state.current);
            };
            const timer = setTimeout(() => finish('timeout'), DOWNLOAD_WAIT_MS);
            chrome.downloads.onChanged.addListener(onChanged);
            // Small files can finish before the listener is in place.
            chrome.downloads.search({ id }).then(([item]) => {
                if (item && item.state !== 'in_progress') finish(item.state);
            });
        });
    }

    setupDownloadListener() {
        // Put our downloads in MyDy/<course>/, keeping the file name Chrome settled on (with its extension).
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

    // ---- run state for the popup and the badge ----

    recordProgress(message, tabId) {
        this.updateRun((run) => reduceRun(run, message, tabId));
    }

    updateRun(change) {
        this.saving = this.saving
            .then(async () => {
                const { [RUN_KEY]: previous } = await chrome.storage.session.get(RUN_KEY);
                const run = change(previous);
                if (!run || run === previous) return;
                await chrome.storage.session.set({ [RUN_KEY]: run });
                showBadge(run);
            })
            .catch((error) => console.warn('Could not save download progress:', error));
    }

    setupTabListeners() {
        // A run lives in its MyDy tab: closing or reloading the tab stops it.
        const stop = (tabId, why) => this.updateRun((run) =>
            run && run.state === 'running' && run.tabId === tabId
                ? { ...run, state: 'error', error: why, updatedAt: Date.now() }
                : run);
        chrome.tabs.onRemoved.addListener((tabId) => stop(tabId, 'The MyDy tab was closed, so the download stopped.'));
        chrome.tabs.onUpdated.addListener((tabId, change) => {
            if (change.status === 'loading') stop(tabId, 'The MyDy tab reloaded or moved to another page, so the download stopped.');
        });
    }
}

// Fold one progress message from content.js into the run's state.
function reduceRun(previous, message, tabId) {
    let run = previous;
    if (message.phase === 'start' || !run || run.state !== 'running') {
        run = {
            state: 'running',
            tabId,
            courses: (message.courses || []).map((name) => ({ name, downloaded: null })),
            current: 0,
            courseStart: 0,
            file: null,
            ratio: 0,
            status: '',
            totals: message.totals,
            results: null,
            error: null,
            startedAt: Date.now()
        };
    }
    run = { ...run, status: message.status || run.status, totals: message.totals || run.totals, updatedAt: Date.now() };

    const { course, file } = message;
    if (course) {
        if (course.index !== run.current) {
            run.current = course.index;
            run.courseStart = run.totals ? run.totals.downloaded : 0;
        }
        run.file = file || null;
        if (message.phase === 'course-done') {
            const downloaded = (run.totals ? run.totals.downloaded : 0) - run.courseStart;
            run.courses = run.courses.map((c, i) => (i === course.index - 1 ? { ...c, downloaded } : c));
            run.file = null;
        }
        const within = message.phase === 'course-done' ? 1 : file && file.total ? file.index / file.total : 0;
        run.ratio = (course.index - 1 + within) / course.total;
    }
    if (message.phase === 'done') {
        run.state = 'done';
        run.ratio = 1;
        run.file = null;
        run.results = message.results || [];
    } else if (message.phase === 'error') {
        run.state = 'error';
        run.error = message.status;
    }
    return run;
}

function showBadge(run) {
    const text = run.state === 'running' ? `${Math.round(run.ratio * 100)}%` : run.state === 'done' ? '✓' : run.state === 'error' ? '!' : '';
    chrome.action.setBadgeBackgroundColor({ color: run.state === 'error' ? '#F0506E' : '#FF6500' });
    if (chrome.action.setBadgeTextColor) chrome.action.setBadgeTextColor({ color: '#08090A' });
    chrome.action.setBadgeText({ text });
}

// Initialize background script
const mydyBackground = new MydyBackground();

chrome.runtime.onInstalled.addListener(() => {
    console.log('MyDy Extension installed');
});
