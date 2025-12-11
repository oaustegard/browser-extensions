javascript:
/* @title: Copy Page Title */
/* @description: Copy the current page's title to clipboard */
(function() {
  const title = document.title;
  navigator.clipboard.writeText(title).then(() => {
    alert('✓ Copied to clipboard:\n' + title);
  }).catch(() => {
    alert('❌ Failed to copy to clipboard');
  });
})();
