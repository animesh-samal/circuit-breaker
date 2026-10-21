import PostCard from "../components/PostCard";
import { PageHead } from "../components/SectionHead";
import { POSTS } from "../content/posts";

export default function Blog() {
  return (
    <div className="container page">
      <PageHead
        eyebrow="Writing"
        title="Notes from breaking things"
        lead="Notes on the decisions behind this site, and on the parts of running infrastructure that only become obvious once you have broken something."
      />

      <div className="post-grid">
        {POSTS.map((post) => (
          <PostCard key={post.slug} post={post} />
        ))}
      </div>

      <p className="page-note">
        Multi-author publishing is planned. It needs accounts, sessions, an
        editor, draft state and an authorisation model — a real application
        rather than a page — so it arrives after the infrastructure work.
      </p>
    </div>
  );
}
