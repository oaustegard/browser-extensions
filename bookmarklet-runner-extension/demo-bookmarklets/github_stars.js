javascript:
/* @title: Count GitHub Stars */
/* @description: Show the number of stars on a GitHub repository page */
/* @domains: github.com */
(function() {
  const starsEl = document.querySelector('[data-view-component="true"] [href$="/stargazers"]');
  if (starsEl) {
    const stars = starsEl.textContent.trim();
    alert('⭐ This repository has ' + stars + ' stars!');
  } else {
    alert('Could not find star count. Make sure you\'re on a GitHub repository page.');
  }
})();
