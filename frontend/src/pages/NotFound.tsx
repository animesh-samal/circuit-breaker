import { Link } from "react-router-dom";

import { PageHead } from "../components/SectionHead";

export default function NotFound() {
  return (
    <div className="container page">
      <PageHead
        eyebrow="404"
        title="No route matched"
        lead={
          <>
            That path isn&rsquo;t served. The ingress routes everything except{" "}
            <code className="mono">/api</code> to this application, so you have
            almost certainly reached the right server and the wrong page.
          </>
        }
      />
      <Link to="/" className="btn btn-ghost">
        Back to the start
      </Link>
    </div>
  );
}
