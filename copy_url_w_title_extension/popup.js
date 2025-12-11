document.addEventListener('DOMContentLoaded', async () => {
  const urlInput = document.getElementById('url');
  const titleInput = document.getElementById('title');
  const copyButton = document.getElementById('copyButton');
  const copyForm = document.getElementById('copyForm');

  try {
    // Query the active tab in the current window
    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // Populate the form fields with the current tab's URL and title
    urlInput.value = tab.url;
    titleInput.value = tab.title;
  } catch (error) {
    console.error('Error fetching tab information:', error);
    urlInput.value = 'Error retrieving URL';
    titleInput.value = 'Error retrieving Title';
  }

  // Function to copy HTML and Markdown to clipboard
  async function copyToClipboard(html, markdown) {
    try {
      const blobHTML = new Blob([html], { type: "text/html" });
      const blobMarkdown = new Blob([markdown], { type: "text/plain" });

      const clipboardItem = new ClipboardItem({
        "text/html": blobHTML,
        "text/plain": blobMarkdown
      });

      await navigator.clipboard.write([clipboardItem]);
      return true;
    } catch (error) {
      console.error('Error copying to clipboard:', error);
      return false;
    }
  }

  // Handle form submission
  copyForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const url = urlInput.value.trim();
    const title = titleInput.value.trim();

    if (!url || !title) {
      alert('Both URL and Title must be provided.');
      return;
    }

    const html = `<a href="${url}">${title}</a>`;
    const markdown = `[${title}](${url})`;

    const success = await copyToClipboard(html, markdown);

    if (success) {
      // Provide immediate feedback
      copyButton.textContent = 'Copied!';
      copyButton.disabled = true;

      setTimeout(() => {
        window.close();
      }, 1000);
    } else {
      alert('Failed to copy to clipboard.');
    }
  });

  // Optional: Handle Enter key when no input is focused
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      // Prevent default behavior to avoid double submission
      event.preventDefault();
      copyForm.dispatchEvent(new Event('submit'));
    }
  });
});
