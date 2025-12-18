// Register the DevTools panel
chrome.devtools.panels.create(
  "Wirebrowser",
  null, // No icon for now
  "devtools/panel.html",
  (panel) => {
    console.log("Wirebrowser panel created");
  }
);
