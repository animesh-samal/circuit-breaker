import { useEffect } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

/* Scroll position on navigation.
 *
 * The home page is one long page of sections, and the nav links into it by hash
 * (/#projects). A client-side route change does not scroll anywhere by itself,
 * so without this a link to /#contact from the blog lands wherever the blog
 * happened to be scrolled, and a link to a new page opens halfway down it.
 *
 *   - a hash scrolls to that section, smoothly, through the CSS scroll-behavior
 *     on <html> -- which reduced motion already turns off;
 *   - a new page starts at the top, instantly, because gliding up past a whole
 *     page you did not ask to see is not a transition, it is a delay;
 *   - back and forward are left alone, so the browser can restore where you were.
 *
 * Depends on `key` as well as the path, so clicking the same section link twice
 * still scrolls back to it. */
export default function ScrollManager() {
  const { pathname, hash, key } = useLocation();
  const navType = useNavigationType();

  useEffect(() => {
    if (hash) {
      document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView();
      return;
    }
    if (navType !== "POP") {
      window.scrollTo({ top: 0, behavior: "instant" });
    }
  }, [pathname, hash, key, navType]);

  return null;
}
