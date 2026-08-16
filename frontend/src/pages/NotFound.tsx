import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div>
      <p className="label" style={{ marginBottom: "1rem" }}>
        404
      </p>
      <h1 style={{ marginBottom: "1.5rem" }}>No route matched</h1>
      <p className="prose">
        That path isn&rsquo;t served. The ingress routes everything except{" "}
        <code className="mono">/api</code> to this application, so you have
        almost certainly reached the right server and the wrong page.
      </p>
      <Link to="/">Back to the start</Link>
    </div>
  );
}
