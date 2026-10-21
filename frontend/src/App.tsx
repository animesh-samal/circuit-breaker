import { Navigate, Route, Routes } from "react-router-dom";

import Footer from "./components/Footer";
import GhibliScene from "./components/GhibliScene";
import Nav from "./components/Nav";
import ScrollManager from "./components/ScrollManager";
import { SystemStatusProvider } from "./lib/systemStatus";
import Blog from "./pages/Blog";
import BlogPost from "./pages/BlogPost";
import Home from "./pages/Home";
import Infrastructure from "./pages/Infrastructure";
import NotFound from "./pages/NotFound";
import Terminal from "./pages/Terminal";
import { useTheme } from "./lib/useTheme";

export default function App() {
  const { theme, setTheme } = useTheme();

  return (
    <SystemStatusProvider>
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      {/* Mounted only for the Ghibli theme, so no other theme pays for the
          scene's DOM nodes or its animations. */}
      {theme === "ghibli" && <GhibliScene />}

      <ScrollManager />
      <Nav theme={theme} setTheme={setTheme} />

      <main id="main" tabIndex={-1}>
        <Routes>
          <Route path="/" element={<Home />} />
          {/* These were pages before the home page became one long scroll.
              Redirected rather than dropped, so links already shared or saved
              still land on the right section. */}
          <Route path="/about" element={<Navigate to="/#about" replace />} />
          <Route path="/experience" element={<Navigate to="/#experience" replace />} />
          <Route path="/contact" element={<Navigate to="/#contact" replace />} />
          <Route path="/infrastructure" element={<Infrastructure />} />
          <Route path="/terminal" element={<Terminal />} />
          <Route path="/blog" element={<Blog />} />
          <Route path="/blog/:slug" element={<BlogPost />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>

      <Footer />
    </SystemStatusProvider>
  );
}
