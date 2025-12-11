javascript:
/* @title: Word Count */
/* @description: Count all words on the current page */
(function() {
  const text = document.body.innerText;
  const words = text.trim().split(/\s+/).filter(w => w.length > 0);
  const chars = text.replace(/\s/g, '').length;
  alert('📊 Page Statistics:\n\nWords: ' + words.length.toLocaleString() + '\nCharacters: ' + chars.toLocaleString());
})();
