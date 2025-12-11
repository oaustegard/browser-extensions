javascript:
/* @title: Highlight All Links */
/* @description: Highlights all links on the current page with a yellow background */
(function() {
  const links = document.querySelectorAll('a');
  links.forEach(link => {
    link.style.backgroundColor = 'yellow';
    link.style.padding = '2px';
  });
  alert('Highlighted ' + links.length + ' links on this page!');
})();
