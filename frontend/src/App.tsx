import { Route, Routes } from "react-router-dom";

import GhibliScene from "./components/GhibliScene";
import HeaderBox from "./components/HeaderBox";
import Sidebar from "./components/Sidebar";
import StatusBar from "./components/StatusBar";
import About from "./pages/About";
import Blog from "./pages/Blog";
import BlogPost from "./pages/BlogPost";
import Contact from "./pages/Contact";
import Experience from "./pages/Experience";
import Home from "./pages/Home";
import Infrastructure from "./pages/Infrastructure";
import NotFound from "./pages/NotFound";
import Terminal from "./pages/Terminal";
import { useTheme } from "./lib/useTheme";

export default function App() {
  const { theme, setTheme } = useTheme();

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      {/* Mounted only for the Ghibli theme, so no other theme pays for the
          scene's DOM nodes or its animations. */}
      {theme === "ghibli" && <GhibliScene />}

      <div className="page-wrap">
        <HeaderBox theme={theme} setTheme={setTheme} />

        <div className="shell">
          <Sidebar />

          <main id="main" className="page">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/about" element={<About />} />
              <Route path="/experience" element={<Experience />} />
              <Route path="/infrastructure" element={<Infrastructure />} />
              <Route path="/terminal" element={<Terminal />} />
              <Route path="/blog" element={<Blog />} />
              <Route path="/blog/:slug" element={<BlogPost />} />
              <Route path="/contact" element={<Contact />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </main>
        </div>
      </div>

      <StatusBar />
    </>
  );
}
