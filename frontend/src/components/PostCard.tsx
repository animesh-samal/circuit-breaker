import { Link } from "react-router-dom";

import type { Post } from "../content/posts";
import Icon from "./Icons";

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/* The whole card is one link, so the hit area is the card rather than the
 * headline -- easier to hit on a phone and clearer to a screen reader, which
 * announces one link per article instead of three. */
export default function PostCard({ post }: { post: Post }) {
  return (
    <article className="card post-card">
      <Link to={`/blog/${post.slug}`} className="post-card-link">
        <p className="post-meta">
          <span>{formatDate(post.date)}</span>
          <span aria-hidden="true">·</span>
          <span>{post.readingMinutes} min read</span>
        </p>

        <h3>{post.title}</h3>
        <p className="post-summary">{post.summary}</p>

        <ul className="chips chips--sm">
          {post.tags.map((tag) => (
            <li className="chip" key={tag}>
              {tag}
            </li>
          ))}
        </ul>

        <span className="text-link post-read">
          Read
          <Icon name="arrow-right" size={14} />
        </span>
      </Link>
    </article>
  );
}
