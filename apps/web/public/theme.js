// Applies the saved theme before the panel renders, so there is no flash of the wrong colors.
// Loaded as a file because the Content-Security-Policy blocks inline scripts.
try {
  var theme = localStorage.getItem("nocap-theme");
  if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;
} catch {
  // Storage can be blocked; the system theme still applies.
}
