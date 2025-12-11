// Create a context menu item for links and selected text.
chrome.contextMenus.create({
  id: "open-at-protocol",
  title: "Open in bsky.app",
  contexts: ["link", "selection"]
});

/**
 * Translates an at:// URI into a canonical bsky.app URL.
 * Expected at URI syntax: at://authority[/collection[/rkey[...]]]
 * 
 * Known mappings:
 * - If only authority is provided, assume a profile URL.
 * - For a post record:
 *     at://<authority>/app.bsky.feed.post/<rkey>
 *   becomes:
 *     https://bsky.app/profile/<authority>/post/<rkey>
 * - For a list record:
 *     at://<authority>/app.bsky.graph.list/<rkey>
 *   becomes:
 *     https://bsky.app/profile/<authority>/list/<rkey>
 * - For a starter pack:
 *     at://<authority>/app.bsky.actor.starterPack/<rkey>
 *   becomes:
 *     https://bsky.app/starter/<rkey>
 * 
 * For unknown collections, a fallback URL is built under /at/.
 */
function translateAtUri(atUri) {
  // Remove "at://"
  const uri = atUri.slice(5);
  // Split by "/"
  const parts = uri.split("/").filter(Boolean);
  if (parts.length === 0) {
    return null;
  }
  
  // If only the authority exists, assume it’s a profile.
  const authority = parts[0];
  if (parts.length === 1) {
    return `https://bsky.app/profile/${authority}`;
  }
  
  // If at least a collection is present:
  const collection = parts[1];
  // rkey might include additional segments; join them.
  const rkey = parts.slice(2).join("/");
  
  // Mapping of known collections to URL patterns.
  const collectionMap = {
    "app.bsky.feed.post": (auth, key) => `https://bsky.app/profile/${auth}/post/${key}`,
    "app.bsky.graph.list": (auth, key) => `https://bsky.app/profile/${auth}/list/${key}`,
    "app.bsky.actor.starterPack": (_auth, key) => `https://bsky.app/starter/${key}`
    // You can add more mappings here for feeds, generators, etc.
  };
  
  if (collectionMap[collection]) {
    return collectionMap[collection](authority, rkey);
  }
  
  // Fallback: if collection is unknown, preserve the path.
  return `https://bsky.app/at/${parts.join("/")}`;
}

// Listener for context menu clicks.
chrome.contextMenus.onClicked.addListener((info, tab) => {
  let atUri = null;
  if (info.linkUrl && info.linkUrl.startsWith("at://")) {
    atUri = info.linkUrl;
  } else if (info.selectionText && info.selectionText.trim().startsWith("at://")) {
    atUri = info.selectionText.trim();
  }
  if (atUri) {
    const bskyUrl = translateAtUri(atUri);
    if (bskyUrl) {
      chrome.tabs.create({ url: bskyUrl });
    } else {
      console.error("Failed to translate at URI:", atUri);
    }
  }
});
