# SemanticHistory privacy policy

Effective 2026-11-26.

SemanticHistory keeps everything it reads on your computer. It collects no personal data, sends no page content,
titles, URLs, search queries or usage data to anyone, and has no account, analytics or advertising.

## What the extension reads

- **Page text and titles** of web pages you keep as the active tab for 10 seconds or more (adjustable), so that
  you can search them later.
- **Your browsing history**, to link each indexed page to its history visits and to remove the page when you
  delete those visits.
- **Your open and recently closed tabs** (titles and URLs), to list and group them in the side panel.

It does not read incognito tabs, the sites on its exclusion list (mail, chat, banking, payments, password
managers, tax, credit bureau and patient-portal sites by default), or pages that look sensitive, such as pages with
password or payment fields. The sensitivity check reads counts of form fields and number patterns, not the page
text.

## Where it is stored

Everything the extension derives from your pages is kept in the extension's storage in your Chrome profile:
passage text, search terms, page titles, URLs and visit times in IndexedDB, and settings in `chrome.storage.local`.
Topic grouping of open tabs is computed in memory and not stored. None of it is synced to your Google account or
copied anywhere else.

## Network access

The extension makes one kind of network request: it downloads the SparseUp v2 search model (about 151 MB of
weights and a tokenizer file) the first time it is needed, and again only if you remove it in Settings. The
request asks for fixed files and carries no information about you beyond what any download reveals to the server
(your IP address and browser). The model runs on your GPU; your pages and queries never leave the browser.

## Deleting data

- Deleting pages from Chrome history deletes them from the index: immediately while Chrome runs, and at the next
  startup or 6-hourly check otherwise.
- Settings → "Clear the index" deletes every indexed page. "Remove the downloaded model" deletes the model.
- Uninstalling the extension deletes all of its data.

## Changes and contact

Changes to this policy are published in this file, with a new effective date. Questions go to the issue tracker at
https://github.com/oaustegard/browser-extensions/issues.
