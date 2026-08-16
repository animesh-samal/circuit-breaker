import { Link } from "react-router-dom";

import { POSTS } from "../content/posts";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function Blog() {
  return (
    <div>
      <h1 style={{ marginBottom: "1rem" }}>Writing</h1>
      <p className="prose" style={{ marginBottom: "2.5rem" }}>
        Notes on the decisions behind this site, and on the parts of running
        infrastructure that only become obvious once you have broken something.
      </p>

      <div style={{ display: "grid", gap: "1rem" }}>
        {POSTS.map((post) => (
          <article key={post.slug} className="post-card">
            <Link to={`/blog/${post.slug}`} className="post-card-link">
              <div
                style={{
                  display: "flex",
                  gap: "0.9rem",
                  flexWrap: "wrap",
                  marginBottom: "0.6rem",
                }}
              >
                <span className="label">{formatDate(post.date)}</span>
                <span className="label">{post.readingMinutes} min read</span>
              </div>

              <h2 style={{ fontSize: "1.375rem", marginBottom: "0.6rem" }}>{post.title}</h2>

              <p className="prose" style={{ margin: "0 0 0.9rem", fontSize: "1rem" }}>
                {post.summary}
              </p>

              <div className="chips" style={{ marginTop: 0 }}>
                {post.tags.map((tag) => (
                  <span className="chip" key={tag}>
                    {tag}
                  </span>
                ))}
              </div>
            </Link>
          </article>
        ))}
      </div>

      <p className="label" style={{ marginTop: "2rem", maxWidth: "var(--measure)", lineHeight: 1.7 }}>
        Multi-author publishing is planned. It needs accounts, sessions, an
        editor, draft state and an authorisation model — a real application
        rather than a page — so it arrives after the infrastructure work.
      </p>
    </div>
  );
}
