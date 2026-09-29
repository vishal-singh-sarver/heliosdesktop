/* Page behaviour on top of Material for MkDocs. Styles live in
 * stylesheets/helios.css.
 */

/* Hide the navigation tabs while the reader scrolls down and bring them back on
 * any scroll up. The header bar above them (logo, title, search) never moves.
 *
 * This only sets `hl-tabs-hidden` on <html>; the "Navigation tabs" rules in
 * stylesheets/helios.css do the hiding. The class lives on <html> because
 * instant navigation replaces the tabs element on every page change.
 */
(function () {
  var root = document.documentElement;
  var header = document.querySelector(".md-header");
  if (!header) return;

  // Always show the tabs until the page has scrolled past the header itself.
  var top = header.offsetHeight;
  // Pixels to travel in one direction before the tabs react, so a trackpad
  // wobble or an overscroll bounce does not make them flicker.
  var travel = 24;

  var last = window.scrollY;
  var turn = last;
  var down = false;

  window.addEventListener(
    "scroll",
    function () {
      var y = window.scrollY;
      if (y <= top) {
        root.classList.remove("hl-tabs-hidden");
        turn = y;
      } else {
        if (y !== last && y > last !== down) {
          down = y > last;
          turn = last;
        }
        if (Math.abs(y - turn) >= travel) {
          root.classList.toggle("hl-tabs-hidden", down);
        }
      }
      last = y;
    },
    { passive: true }
  );
})();

/* "Back to top" scrolls smoothly. Material's own handler on the button jumps
 * straight to the top; this listener runs first (capture phase on document)
 * and stops the click from reaching it. Readers who ask the OS for reduced
 * motion still get the jump.
 */
(function () {
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  document.addEventListener(
    "click",
    function (event) {
      if (!event.target.closest || !event.target.closest(".md-top")) return;
      event.preventDefault();
      event.stopPropagation();
      window.scrollTo({ top: 0, behavior: reduceMotion.matches ? "auto" : "smooth" });
    },
    true
  );
})();
