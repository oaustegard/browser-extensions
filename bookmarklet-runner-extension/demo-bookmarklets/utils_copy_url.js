javascript:
/* @title: Copy Current URL */
/* @description: Copy the current page URL to clipboard */
(function() {
  const url = window.location.href;
  navigator.clipboard.writeText(url).then(() => {
    alert('✓ Copied to clipboard:\n' + url);
  }).catch(() => {
    alert('❌ Failed to copy to clipboard');
  });
})();
