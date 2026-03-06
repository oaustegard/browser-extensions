// Tracks the post URL under the cursor when a context menu is triggered.
// Bsky post URLs match: /profile/<handle>/post/<rkey>
(function () {
    if (window.__bskyPostUrlTrackerInstalled) return;
    window.__bskyPostUrlTrackerInstalled = true;
    window.__bskyHoveredPostUrl = null;

    document.addEventListener('mousedown', (e) => {
        if (e.button !== 2) return;
        window.__bskyHoveredPostUrl = null;

        let el = e.target;
        while (el && el !== document.body) {
            if (el.tagName === 'A' && el.href) {
                try {
                    const url = new URL(el.href);
                    if (/^\/profile\/[^/]+\/post\/[^/]+/.test(url.pathname)) {
                        window.__bskyHoveredPostUrl = el.href;
                        break;
                    }
                } catch (_) {}
            }
            el = el.parentElement;
        }
    }, true);
})();
