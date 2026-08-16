import { Link, useParams } from "react-router-dom";

import { getPost } from "../content/posts";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function BlogPost() {
  const { slug } = useParams<{ slug: string }>();
  const post = slug ? getPost(slug) : undefined;

  if (!post) {
    return (
      <div style={{ maxWidth: "var(--measure)" }}>
        <h1 style={{ marginBottom: "1rem" }}>No such post</h1>
        <p className="prose">That article does not exist, or it has been renamed.</p>
        <Link to="/blog" className="mono" style={{ fontSize: "0.8125rem" }}>
          ← All writing
        </Link>
      </div>
    );
  }

  return (
    <article style={{ maxWidth: "var(--measure)" }}>
      <Link
        to="/blog"
        className="mono"
        style={{ fontSize: "0.75rem", color: "var(--text-mute)", display: "inline-block", marginBottom: "1.5rem" }}
      >
        ← All writing
      </Link>

      <div style={{ display: "flex", gap: "0.9rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
        <span className="label">{formatDate(post.date)}</span>
        <span className="label">{post.readingMinutes} min read</span>
        <span className="label">{post.author}</span>
      </div>

      <h1 style={{ marginBottom: "1.75rem" }}>{post.title}</h1>

      {post.body.map((para) => (
        <p className="prose" key={para.slice(0, 40)} style={{ marginBottom: "1.25rem" }}>
          {para}
        </p>
      ))}

      <div className="chips" style={{ marginTop: "2rem" }}>
        {post.tags.map((tag) => (
          <span className="chip" key={tag}>
            {tag}
          </span>
        ))}
      </div>
    </article>
  );
}
