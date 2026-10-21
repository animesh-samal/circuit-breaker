import About from "../components/home/About";
import Contact from "../components/home/Contact";
import Experience from "../components/home/Experience";
import Hero from "../components/home/Hero";
import Projects from "../components/home/Projects";
import Skills from "../components/home/Skills";
import Writing from "../components/home/Writing";

/* One long page. About, experience and contact used to be separate routes, each
 * a click away and each a few paragraphs long; a recruiter skimming the site
 * now scrolls through all of it instead of guessing which link to open. The old
 * routes redirect to their section here, so existing links keep working. */
export default function Home() {
  return (
    <>
      <Hero />
      <About />
      <Experience />
      <Skills />
      <Projects />
      <Writing />
      <Contact />
    </>
  );
}
