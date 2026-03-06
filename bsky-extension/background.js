const TOOLS_BASE = "https://oaustegard.github.io/bsky";

chrome.runtime.onInstalled.addListener(() => {
    // -- Post/Thread actions (parent menu) --
    chrome.contextMenus.create({
        id: "bsky-post-tools",
        title: "Post Tools",
        contexts: ["page", "link"],
        documentUrlPatterns: ["*://bsky.app/*"]
    });

    chrome.contextMenus.create({
        id: "bsky-thread",
        parentId: "bsky-post-tools",
        title: "Thread Reader",
        contexts: ["page", "link"],
        documentUrlPatterns: ["*://bsky.app/*"]
    });

    chrome.contextMenus.create({
        id: "bsky-constellation",
        parentId: "bsky-post-tools",
        title: "Post Constellation Graph",
        contexts: ["page", "link"],
        documentUrlPatterns: ["*://bsky.app/*"]
    });

    chrome.contextMenus.create({
        id: "bsky-processor",
        parentId: "bsky-post-tools",
        title: "Thread/Quote Processor",
        contexts: ["page", "link"],
        documentUrlPatterns: ["*://bsky.app/*"]
    });

    // -- Profile actions (parent menu) --
    chrome.contextMenus.create({
        id: "bsky-profile-tools",
        title: "Profile Tools",
        contexts: ["page", "link"],
        documentUrlPatterns: ["*://bsky.app/*"]
    });

    chrome.contextMenus.create({
        id: "bsky-user-lists",
        parentId: "bsky-profile-tools",
        title: "View User Lists",
        contexts: ["page", "link"],
        documentUrlPatterns: ["*://bsky.app/*"]
    });

    chrome.contextMenus.create({
        id: "bsky-profile-hover",
        parentId: "bsky-profile-tools",
        title: "Enable Profile Hover Preview",
        contexts: ["page"],
        documentUrlPatterns: ["*://bsky.app/*"]
    });

    // -- List tools (parent menu) --
    chrome.contextMenus.create({
        id: "bsky-list-tools",
        title: "List Tools",
        contexts: ["page", "link"],
        documentUrlPatterns: ["*://bsky.app/*"]
    });

    chrome.contextMenus.create({
        id: "bsky-list-to-list",
        parentId: "bsky-list-tools",
        title: "List-to-List Copy",
        contexts: ["page", "link"],
        documentUrlPatterns: ["*://bsky.app/*"]
    });

    chrome.contextMenus.create({
        id: "bsky-starterpack-to-list",
        parentId: "bsky-list-tools",
        title: "Starter Pack to List",
        contexts: ["page", "link"],
        documentUrlPatterns: ["*://bsky.app/*"]
    });

    // -- Page-level actions --
    chrome.contextMenus.create({
        id: "bsky-advanced-search",
        title: "Advanced Search",
        contexts: ["page"],
        documentUrlPatterns: ["*://bsky.app/*"]
    });

    chrome.contextMenus.create({
        id: "bsky-markdown-post",
        title: "Create Post with Markdown Link",
        contexts: ["page"],
        documentUrlPatterns: ["*://bsky.app/*"]
    });

    // -- Discovery tools (parent menu) --
    chrome.contextMenus.create({
        id: "bsky-discovery-tools",
        title: "Discovery Tools",
        contexts: ["page"],
        documentUrlPatterns: ["*://bsky.app/*"]
    });

    chrome.contextMenus.create({
        id: "bsky-zeitgeist",
        parentId: "bsky-discovery-tools",
        title: "Bluesky Zeitgeist",
        contexts: ["page"],
        documentUrlPatterns: ["*://bsky.app/*"]
    });

    chrome.contextMenus.create({
        id: "bsky-report",
        parentId: "bsky-discovery-tools",
        title: "Bsky Report (Top Links)",
        contexts: ["page"],
        documentUrlPatterns: ["*://bsky.app/*"]
    });

    chrome.contextMenus.create({
        id: "bsky-github-search",
        parentId: "bsky-discovery-tools",
        title: "GitHub Link Search",
        contexts: ["page"],
        documentUrlPatterns: ["*://bsky.app/*"]
    });
});

// Resolve the best post URL: content script detection > linkUrl > pageUrl
async function getPostUrl(tab, info) {
    if (info.linkUrl) return info.linkUrl;
    try {
        const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => window.__bskyHoveredPostUrl
        });
        const detected = results?.[0]?.result;
        if (detected) return detected;
    } catch (_) {}
    return info.pageUrl;
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (!tab || !tab.id) return;

    const urlToUse = info.linkUrl || info.pageUrl;

    switch (info.menuItemId) {
        // -- Post tools (resolve hovered post URL) --
        case "bsky-thread": {
            const url = await getPostUrl(tab, info);
            chrome.tabs.create({ url: `${TOOLS_BASE}/thread-reader.html?url=${encodeURIComponent(url)}` });
            break;
        }

        case "bsky-constellation": {
            const url = await getPostUrl(tab, info);
            chrome.tabs.create({ url: `${TOOLS_BASE}/post-constellation-graph.html?url=${encodeURIComponent(url)}` });
            break;
        }

        case "bsky-processor": {
            const url = await getPostUrl(tab, info);
            chrome.tabs.create({ url: `${TOOLS_BASE}/processor.html?url=${encodeURIComponent(url)}` });
            break;
        }

        // -- Profile tools (inject scripts) --
        case "bsky-profile-hover":
            chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ["scripts/bsky_profile_latest_posts.js"]
            });
            break;

        case "bsky-user-lists":
            chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: (url) => { window.__bskyExtensionTargetUrl = url; },
                args: [urlToUse]
            }, () => {
                chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ["scripts/bsky_user_lists.js"]
                });
            });
            break;

        // -- List tools (open in new tab) --
        case "bsky-list-to-list":
            chrome.tabs.create({ url: `${TOOLS_BASE}/list-to-list.html` });
            break;

        case "bsky-starterpack-to-list":
            chrome.tabs.create({ url: `${TOOLS_BASE}/starterpack-to-list.html` });
            break;

        // -- Page-level actions (inject scripts) --
        case "bsky-advanced-search":
            chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ["scripts/bsky_advanced_search.js"]
            });
            break;

        case "bsky-markdown-post":
            chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ["scripts/bsky_markdown_link_post.js"]
            });
            break;

        // -- Discovery tools (open in new tab) --
        case "bsky-zeitgeist":
            chrome.tabs.create({ url: `${TOOLS_BASE}/bsky-zeitgeist.html` });
            break;

        case "bsky-report":
            chrome.tabs.create({ url: `${TOOLS_BASE}/report.html` });
            break;

        case "bsky-github-search":
            chrome.tabs.create({ url: `${TOOLS_BASE}/github-search.html` });
            break;
    }
});
