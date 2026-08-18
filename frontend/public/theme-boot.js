(function () {
  try {
    var root = document.documentElement;
    var t = localStorage.getItem("alleone.theme");
    var theme = t === "light" || t === "dark" ? t : "dark";
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    var c = localStorage.getItem("alleone.sidebar.collapsed");
    var w = c === "1" ? 72 : 260;
    root.style.setProperty("--sidebar-width", w + "px");
    root.dataset.sidebarCollapsed = c === "1" ? "true" : "false";
  } catch (e) {
    /* ignore */
  }
})();
