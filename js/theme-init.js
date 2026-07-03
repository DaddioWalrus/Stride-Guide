// Applies the saved theme override before first paint to avoid a flash.
// Loaded synchronously in <head>; the full theme control lives in ui.js.
(function () {
  try {
    var t = localStorage.getItem('sgTheme');
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  } catch (e) {}
}());
