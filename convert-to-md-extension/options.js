document.addEventListener('DOMContentLoaded', () => {
    // Load stored options; if none, use defaults.
    chrome.storage.sync.get({
      mode: 'v1',
      copy: true
    }, (items) => {
      document.querySelector(`input[name="mode"][value="${items.mode}"]`).checked = true;
      document.getElementById('copy').checked = items.copy;
    });
  
    // Save options when the form is submitted.
    document.getElementById('options-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const mode = document.querySelector('input[name="mode"]:checked').value;
      const copy = document.getElementById('copy').checked;
      chrome.storage.sync.set({ mode, copy }, () => {
        const status = document.getElementById('status');
        status.textContent = 'Options saved.';
        setTimeout(() => {
          status.textContent = '';
        }, 2000);
      });
    });
  });
  