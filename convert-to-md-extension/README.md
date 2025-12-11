# <img src="./icon.png?raw=true" width="64px"> Convert to MD with Jina ReaderLM


**Convert to MD with Jina ReaderLM** is a Chrome extension that converts any webpage to Markdown using the [Jina ReaderLM](https://jina.ai) service. It supports two conversion modes:

- **v1 (default):** Standard conversion.
- **v2:** Enhanced conversion with additional headers (`x-engine: readerlm-v2` and `Accept: text/event-stream`).  
  *Note:* v2 produces more accurate results but is slower and may not capture the full page. See details [here](https://jina.ai/news/readerlm-v2-frontier-small-language-model-for-html-to-markdown-and-json).

The extension automatically copies the resulting Markdown to your clipboard once the conversion is complete.

---

## How It Works

- **Activation:**  
  Trigger the extension by either clicking its toolbar icon or selecting **"Open with Jina"** from the right-click context menu.

- **Conversion Process:**  
  When activated, a new tab opens (displaying the conversion result) that:
  - Fetches the Markdown conversion for the current page via Jina's API.
  - Processes the response (streaming for v2 mode) and displays the result.
  - Automatically copies the final Markdown to the clipboard (if enabled in the options).

- **Privacy:**  
  No data is captured or stored by the extension maker. All processing is done via the Jina API and is subject to [Jina's Terms & Conditions](https://jina.ai/legal/).

---

## Permissions

The extension requires the following permissions:
- `activeTab`
- `scripting`
- `storage`
- `contextMenus`
- `declarativeNetRequest`
- `declarativeNetRequestWithHostAccess`
- `clipboardWrite`
- Host access: `<all_urls>`

These permissions ensure the extension can access the current page, modify requests for v2 mode, and perform clipboard operations.

---

## Installation

1. **Download or clone** the repository containing the extension files.
2. Ensure the following files are in the same folder:
   - `manifest.json`
   - `background.js`
   - `options.html`
   - `options.js`
   - `result.html`
   - `result.js`
   - `icon.png` (128×128 px)
   - `LICENSE` (MIT)
3. Open Chrome and navigate to: `chrome://extensions`
4. Enable **Developer Mode** (toggle in the top-right corner).
5. Click **Load unpacked** and select the folder containing the extension files.
6. The extension icon (using `icon.png`) will appear in your browser toolbar.

---

## Usage

- **Toolbar Icon:**  
  Click the extension icon to convert the current page to Markdown.

- **Context Menu:**  
  Right-click on any webpage and choose **"Open with Jina"** to perform the conversion.

- **Options:**  
  Use the options page to switch between v1 and v2 modes and to toggle clipboard copying.

---

## Additional Information

- For more details on the enhanced v2 model, please see:  
  [Jina ReaderLM v2: Frontier Small Language Model for HTML to Markdown and JSON](https://jina.ai/news/readerlm-v2-frontier-small-language-model-for-html-to-markdown-and-json)
- This extension is distributed under the MIT License. Refer to the [LICENSE](./LICENSE) file for details.

---

Enjoy converting webpages to Markdown effortlessly with **Convert to MD with Jina ReaderLM**!
