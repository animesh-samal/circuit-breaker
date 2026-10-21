import { Link, useParams } from "react-router-dom";

import Icon from "../components/Icons";
import { formatDate } from "../components/PostCard";
import { PageHead } from "../components/SectionHead";
import { getPost } from "../content/posts";

function BackLink() {
  return (
    <Link to="/blog" className="text-link back-link">
      <span className="flip" aria-hidden="true">
        <Icon name="arrow-right" size={14} />
      </span>
      All writing
    </Link>
  );
}

export default function BlogPost() {
  const { slug } = useParams<{ slug: string }>();
  const post = slug ? getPost(slug) : undefined;

  if (!post) {
    return (
      <div className="container page">
        <PageHead eyebrow="Writing" title="No such post" lead="That article does not exist, or it has been renamed." />
        <BackLink />
      </div>
    );
  }

  return (
    <article className="container page article">
      <BackLink />

      <p className="post-meta">
        <span>{formatDate(post.date)}</span>
        <span aria-hidden="true">·</span>
        <span>{post.readingMinutes} min read</span>
        <span aria-hidden="true">·</span>
        <span>{post.author}</span>
      </p>

      <h1>{post.title}</h1>

      {post.body.map((para) => (
        <p className="prose" key={para.slice(0, 40)}>
          {para}
        </p>
      ))}

      <ul className="chips chips--sm" aria-label="Tags">
        {post.tags.map((tag) => (
          <li className="chip" key={tag}>
            {tag}
          </li>
        ))}
      </ul>
    </article>
  );
}
