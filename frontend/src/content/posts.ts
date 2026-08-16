/* Post store.
 *
 * A local module for now. When multi-author writing arrives this becomes an API
 * call and the shape below becomes the response contract, so the components are
 * written against `Post` rather than against this array.
 *
 * Worth being clear about what multi-author actually requires: user accounts,
 * password or OAuth handling, sessions, an editor, draft state, and an
 * authorisation model deciding who may publish. That is a real application, not
 * a page -- see the note at the bottom of the blog index.
 */

export interface Post {
  slug: string;
  title: string;
  summary: string;
  date: string;
  author: string;
  readingMinutes: number;
  tags: string[];
  body: string[];
}

export const POSTS: Post[] = [
  {
    slug: "why-k3s-not-eks",
    title: "Why this site runs on k3s and not EKS",
    summary:
      "A managed Kubernetes control plane costs $73 a month before a single node exists. Here is what I gave up by not paying it, and what turned out not to matter.",
    date: "2026-08-14",
    author: "Animesh Samal",
    readingMinutes: 6,
    tags: ["kubernetes", "cost", "aws"],
    body: [
      "Amazon EKS charges $0.10 per hour for the control plane. That is roughly $73 a month before you have run a single workload, added a node, or served a request. For a portfolio project with a five dollar monthly ceiling, that number ends the conversation on its own.",
      "The alternative I chose is k3s, a CNCF-conformant Kubernetes distribution that runs the control plane and the kubelet in a single process on one node. Conformant matters here: it is not a Kubernetes-like thing, it is Kubernetes. The manifests in this repository would apply unchanged to EKS tomorrow.",
      "What I actually gave up is worth being precise about. There is no managed control plane, so if the node dies the cluster dies with it. There is no multi-AZ resilience. Upgrades are mine to perform. Etcd is replaced with SQLite by default. For a production system carrying revenue, every one of those is disqualifying.",
      "For learning the primitives, none of them are. Deployments, Services, Ingress, probes, RBAC, resource limits, horizontal autoscaling and rolling updates behave identically. The debugging loop is identical. The failure modes I deliberately caused while building this — CrashLoopBackOff, ImagePullBackOff, OOMKilled, a readiness probe failing while liveness passed — all presented exactly as they would on a managed cluster.",
      "The version of this that would be wrong is claiming k3s is equivalent, or reaching for it in a context where the managed control plane is the whole point. It is a deliberate trade with a stated cost, which is different from a shortcut.",
    ],
  },
  {
    slug: "the-api-that-billed-me-to-watch-my-bill",
    title: "The API that billed me for watching my bill",
    summary:
      "AWS Cost Explorer charges a cent per request. Polling it hourly would have made cost monitoring the largest line item on the invoice it was monitoring.",
    date: "2026-08-11",
    author: "Animesh Samal",
    readingMinutes: 4,
    tags: ["aws", "cost", "design"],
    body: [
      "This site shows its own month-to-date AWS spend. The obvious implementation is to call the Cost Explorer API when someone loads the page, or on a timer, and cache the result briefly.",
      "Cost Explorer bills $0.01 per request. At one call an hour that is 720 calls a month, or $7.20 — more than the EC2 instance the whole site runs on. The observability feature would have quietly become the largest thing it was observing.",
      "The fix is unglamorous: refresh once a day, store the result, and serve every page view from cache. Roughly $0.30 a month. But the interesting part is what it forced, which was treating the freshness requirement as a question rather than an assumption. Nobody needs a month-to-date total accurate to the hour. It moves slowly by construction.",
      "That reframing generalises further than I expected. A cache TTL is usually discussed as a performance knob. Here it is a spend control, and the correct value came from asking how stale the number is allowed to be rather than how fast the page should feel.",
    ],
  },
  {
    slug: "liveness-probes-that-cause-outages",
    title: "Liveness probes that cause the outage they were meant to catch",
    summary:
      "Checking your dependencies in a liveness probe converts a brief upstream blip into a full restart storm. The fix is to check almost nothing.",
    date: "2026-08-07",
    author: "Animesh Samal",
    readingMinutes: 5,
    tags: ["kubernetes", "reliability"],
    body: [
      "A liveness probe answers one question: should Kubernetes kill this container and start a new one? A readiness probe answers a different one: should this pod receive traffic right now? The consequences are restart versus divert, and conflating them is expensive.",
      "The instinct is to make both thorough — check the database, check the cache, check the downstream API. It feels responsible. Then the database has a thirty second blip, every replica fails liveness simultaneously, and Kubernetes restarts the entire deployment over a fault that had nothing to do with the containers. Caches are cold, every process reconnects at once, and a thirty second problem becomes a fifteen minute outage that you built.",
      "Had those been readiness probes, the pods would have dropped out of rotation, stayed warm, and returned when the database did. The outage would have lasted exactly as long as the fault.",
      "So the liveness endpoint on this service does nothing. It returns a fixed response and touches no dependency. The diagnostic value is in whether the request completes at all — that proves the process is running, the port is bound and the event loop is scheduling work. If it is deadlocked or wedged, the probe times out, and that is precisely the condition a restart repairs.",
      "There is a stronger position worth knowing about, which is that liveness probes are net harmful often enough that many services should omit them entirely. I kept one, because the failure it catches is real. But the argument against is better than it first sounds.",
    ],
  },
];

export function getPost(slug: string): Post | undefined {
  return POSTS.find((p) => p.slug === slug);
}
