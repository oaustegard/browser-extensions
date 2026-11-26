# SemanticHistory

Semantic search over the pages you have read in Chrome, in the side panel. Pages are embedded on your GPU by
SparseUp v2, a learned sparse retrieval model, and stored in the extension's IndexedDB. The only network request
the extension makes is the one-time model download; page text, titles and URLs stay in the browser.
See [PRIVACY.md](PRIVACY.md) for the privacy policy.

## Install

Needs Chrome 116 or later on a machine with WebGPU, and about 151 MB of disk for the model plus a few MB for the
index.

1. `chrome://extensions` → Developer mode → Load unpacked → this folder.
2. Click the toolbar icon or press Alt+Shift+H (change it at `chrome://extensions/shortcuts`).

On first run the panel shows a progress bar while the model downloads (once; it is cached afterwards). Until the
model is ready, search falls back to keyword matching on Chrome history titles and URLs.

Chrome asks for access to all sites and to your history. The extension needs the first to read the text of pages
you read, and the second to tie each indexed page to its history entry, so that deleting history deletes it here.

## Use

- **Empty search box**: open tabs, recently closed tabs (Chrome keeps the last 25) and pages read in the past 3
  days. The buttons above the list choose the grouping: **Topics** (tabs the model finds similar, labelled with
  the terms they share; available once the model has loaded), **Windows**, or **Recent**. Click a row to switch to
  the tab or reopen it; × closes an open tab.
- **Typing a query**: searches everything indexed. Each result shows the passage that matched and the terms that
  produced the match. A solid outline marks a word that appears in the page; a dashed outline marks a related term
  the model added, which is how a page can match without containing your words.
- **Filters**: the date you read the page (today, 7 or 30 days, or a custom range) and **Open tabs only**.
- ↑ / ↓ and Enter move through the list and open a row; Esc clears the query.

## What gets indexed

A page is indexed once it has been the active tab of the focused window for 10 seconds (adjustable). Only pages
read after install are indexed. The extension takes the page's main text with Mozilla's Readability, splits it
into passages of about 380 tokens, and stores each passage's text and its 128 strongest terms. It keeps the first
12 passages of a page (about 3,500 words), so text further down a very long page cannot be found.

Never indexed:

- incognito tabs, non-web pages (`chrome://`, files), and pages Chrome does not let extensions read (the Web
  Store, PDFs, other extensions);
- sites on the exclusion list in Settings, which starts with mail, chat, password managers, payment services,
  banks, brokerages, crypto exchanges, tax, credit bureau and patient-portal sites;
- hosts whose names suggest a bank, credit union, insurer, pharmacy or patient portal;
- pages that look sensitive: visible password or payment fields, fields for account, routing, tax or ID numbers,
  card numbers that pass the Luhn check, SSN-shaped numbers, or banking and medical wording. This check runs
  before the page's text is read and returns only counts.

The "Skip pages that look sensitive" setting turns off the last two checks; the exclusion list always applies.
Settings lists recent skips with their reasons, so a wrongly skipped site is easy to spot and exclusions can be
edited. Adding a site to the list also removes its pages from the index.

## History deletions

The index records which history visits each page was read at. When history no longer has any of those visits,
because you deleted the URL, a time range or all history, the page and its passages are deleted. Deletions made
while Chrome runs are applied at once; a check at startup and every 6 hours catches the rest (Settings → "Remove
pages deleted from history now" runs it by hand). Pages therefore stay searchable as long as Chrome keeps the
visits, which is about 90 days by default.

## Model

SparseUp v2 is [Linkup-Platform/linkup-sparseup-embed-v2](https://huggingface.co/Linkup-Platform/linkup-sparseup-embed-v2)
(Apache-2.0), a ModernBERT-base model that turns text into a weighted list of vocabulary terms. The extension runs
an 8-bit copy of it with the WebGPU engine from
[oaustegard/experiments `sparseup-v2/pack`](https://github.com/oaustegard/experiments/tree/main/sparseup-v2/pack),
downloaded from `pub-38421218e82c4d4ba2bc53974c28b55d.r2.dev` and kept in the extension's Cache Storage.
Settings can remove it.

Without WebGPU nothing is indexed and Topics grouping is unavailable; search uses Chrome history keywords only.

After 5 idle minutes the model is unloaded from the GPU; the next search waits a few seconds while it reloads
from the cache.

## Files

| file | role |
|---|---|
| `background.js` | service worker: dwell tracking, exclusion checks, page extraction, history deletions |
| `offscreen.js` | hidden page that runs the model (service workers cannot use WebGPU): indexing, search, topic grouping |
| `sidepanel.*` | the panel and its settings |
| `lib/db.js` | IndexedDB store of pages and passages |
| `lib/sensitive.js` | exclusion list and sensitive-page rules |
| `lib/model.js` | model loader (Cache Storage) and tokenizer |
| `lib/wgsl/` | engine and kernels, copied from `oaustegard/experiments` (`_lib/wgsl`, `sparseup-v2/pack/web/engine.js`) |
| `lib/vendor/` | `@huggingface/tokenizers` 0.2.0 and `@mozilla/readability` 0.6.0 (both Apache-2.0) |
| `PRIVACY.md` | privacy policy |
| `NOTICE`, `LICENSE-*` | third-party credits and licence texts |
