import { Link } from "react-router-dom";

import { POSTS } from "../../content/posts";
import Icon from "../Icons";
import PostCard from "../PostCard";
import Reveal from "../Reveal";
import { SectionHead } from "../SectionHead";

export default function Writing() {
  return (
    <section id="writing" className="section section--alt">
      <div className="container">
        <Reveal>
          <SectionHead
            eyebrow="Writing"
            title="Notes from"
            accent="breaking things."
            lead="The decisions behind this site, and the parts of running infrastructure that only become obvious once you have broken something."
          />
        </Reveal>

        <Reveal>
          <div className="post-grid">
            {POSTS.slice(0, 3).map((post) => (
              <PostCard key={post.slug} post={post} />
            ))}
          </div>
        </Reveal>

        <Reveal>
          <Link to="/blog" className="text-link section-foot">
            All writing
            <Icon name="arrow-right" size={14} />
          </Link>
        </Reveal>
      </div>
    </section>
  );
}
