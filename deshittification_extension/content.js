// content.js

// Function to apply hiding rules
function applyHidingRules() {
    chrome.storage.sync.get(null, (data) => {
      const url = window.location.hostname;
      const rules = data[url];
      if (rules) {
        rules.forEach(rule => {
          const elements = document.querySelectorAll(rule.selector);
          elements.forEach(el => {
            el.style.display = 'none';
          });
        });
      }
    });
  }
  
  // Initial application
  applyHidingRules();
  
  // Observe DOM changes to apply rules dynamically
  const observer = new MutationObserver(() => {
    applyHidingRules();
  });
  
  observer.observe(document.body, { childList: true, subtree: true });
  
  // Listen for messages from background script
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'refreshRules') {
      applyHidingRules();
    }
    if (message.action === 'startPicker') {
      initiateElementPicker();
      sendResponse({ status: 'Picker started' });
    }
  });

  // Function to initiate element picker
function initiateElementPicker() {
  // Create the overlay
  const overlay = document.createElement('div');
  overlay.id = 'deshittification-overlay';
  overlay.style.position = 'fixed';
  overlay.style.top = 0;
  overlay.style.left = 0;
  overlay.style.width = '100%';
  overlay.style.height = '100%';
  overlay.style.zIndex = 9999;
  overlay.style.cursor = 'crosshair';
  overlay.style.backgroundColor = 'rgba(0,0,0,0.1)';
  document.body.appendChild(overlay);

  // Define the getUniqueSelector function within the same scope
  function getUniqueSelector(el) {
    if (!(el instanceof Element)) return;
    let path = [];
    while (el.nodeType === Node.ELEMENT_NODE) {
      let selector = el.nodeName.toLowerCase();
      if (el.id) {
        selector += `#${el.id}`;
        path.unshift(selector);
        break;
      } else {
        let sib = el, nth = 1;
        while (sib = sib.previousElementSibling) {
          if (sib.nodeName.toLowerCase() === selector) nth++;
        }
        if (nth !== 1) selector += `:nth-of-type(${nth})`;
      }
      path.unshift(selector);
      el = el.parentNode;
    }
    return path.join(" > ");
  }

  // Click event handler
  function handleClick(e) {
    e.preventDefault();
    e.stopPropagation();

    // Temporarily hide the overlay to get the underlying element
    overlay.style.display = 'none';

    // Get the element at the clicked position
    const element = document.elementFromPoint(e.clientX, e.clientY);

    // Restore the overlay's display
    overlay.style.display = 'block';

    if (element) {
      const selector = getUniqueSelector(element);
      // Send the selector to the background script to add the rule
      chrome.runtime.sendMessage({ action: 'addRule', selector });
    }

    // Remove the overlay and the event listener
    document.body.removeChild(overlay);
    overlay.removeEventListener('click', handleClick, true);
    // Remove the highlight style
    const highlightStyle = document.getElementById('deshittification-highlight-style');
    if (highlightStyle) {
      highlightStyle.remove();
    }
  }

  // Attach the click event listener
  overlay.addEventListener('click', handleClick, true);

  // Highlight element under cursor for better UX
  function handleMouseMove(e) {
    // Remove previous outlines
    const previouslyHighlighted = document.querySelectorAll('.deshittification-highlight');
    previouslyHighlighted.forEach(el => el.classList.remove('deshittification-highlight'));

    // Get the element under the cursor
    const element = document.elementFromPoint(e.clientX, e.clientY);
    if (element) {
      element.classList.add('deshittification-highlight');
    }
  }

  // Define highlight style
  let highlightStyle = document.getElementById('deshittification-highlight-style');
  if (!highlightStyle) {
    highlightStyle = document.createElement('style');
    highlightStyle.id = 'deshittification-highlight-style';
    highlightStyle.textContent = `
      .deshittification-highlight {
        outline: 2px solid red !important;
      }
    `;
    document.head.appendChild(highlightStyle);
  }

  // Attach mousemove event listener for highlighting
  overlay.addEventListener('mousemove', handleMouseMove, true);

  // Clean up highlight on mouse out
  function handleMouseOut(e) {
    const highlighted = document.querySelectorAll('.deshittification-highlight');
    highlighted.forEach(el => el.classList.remove('deshittification-highlight'));
  }

  overlay.addEventListener('mouseout', handleMouseOut, true);
}
  