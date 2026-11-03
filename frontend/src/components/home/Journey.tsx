import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { JOURNEY, type JourneyIcon } from "../../content/profile";
import Icon from "../Icons";
import Reveal from "../Reveal";
import { SectionHead } from "../SectionHead";

/* The journey map.
 *
 * Six stops joined by a road. On a wide screen the stops snake across two rows
 * of three, left to right and then back, with a rounded bend at the end of the
 * first row; on a phone they stack, with the road running straight down the
 * left. Hovering a stop lights the road up to it, sends a dot along the lit
 * part and fades the stops still ahead.
 *
 * The road is measured from the rendered cards rather than drawn to fixed
 * coordinates. Cards change height with the font, the theme and the length of
 * the text, and a road drawn to guessed positions ends up crossing them. A
 * ResizeObserver re-measures whenever any of that moves.
 *
 * Every word on it is in the list below, in the DOM, in order. The road is
 * decoration and hidden from screen readers; nothing is only in the picture. */

// Stop glyphs, larger than the 16px UI set and drawn on a 24px grid. They only
// exist inside this diagram, so they live here rather than in Icons.tsx.
const GLYPHS: Record<JourneyIcon, React.ReactNode> = {
  cap: (
    <>
      <path d="M2.5 9 12 4.5 21.5 9 12 13.5Z" />
      <path d="M6.5 11v4.5c0 1.4 2.5 3 5.5 3s5.5-1.6 5.5-3V11" />
      <path d="M21.5 9v5" />
    </>
  ),
  chart: (
    <>
      <path d="M3.5 20.5h17" />
      <path d="m4.5 15.5 4.5-4.5 3.5 3.5 6.5-6.5" />
      <path d="M15 8h4v4" />
    </>
  ),
  briefcase: (
    <>
      <rect x="3.5" y="7.5" width="17" height="12" rx="2" />
      <path d="M9 7.5V6a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 6v1.5" />
      <path d="M3.5 12.5h17" />
    </>
  ),
  branch: (
    <>
      <circle cx="6.5" cy="5.5" r="2" />
      <circle cx="6.5" cy="18.5" r="2" />
      <circle cx="17.5" cy="8.5" r="2" />
      <path d="M6.5 7.5v9" />
      <path d="M17.5 10.5c0 4-5 3.5-9.4 6.4" />
    </>
  ),
  server: (
    <>
      <rect x="3.5" y="4" width="17" height="6.5" rx="1.5" />
      <rect x="3.5" y="13.5" width="17" height="6.5" rx="1.5" />
      <path d="M7.5 7.25h.01M7.5 16.75h.01" strokeWidth="2.6" />
    </>
  ),
  flag: (
    <>
      <path d="M5.5 21V4" />
      <path d="M5.5 4.5h11l-2 3.5 2 3.5h-11" />
    </>
  ),
};

const COLUMNS = 3;
const WIDE = "(min-width: 900px)";
// How far past the last card the bend at the end of a row swings out.
const BEND_CLEARANCE = 26;

interface Point {
  x: number;
  y: number;
}

/* Grid cell for stop i on a wide screen. Odd rows run left to right, even rows
   right to left, so each row starts under the column the last one ended in. */
function cell(i: number): { row: number; col: number } {
  const row = Math.floor(i / COLUMNS);
  const pos = i % COLUMNS;
  return { row: row + 1, col: row % 2 === 0 ? pos + 1 : COLUMNS - pos };
}

/* One road segment from stop a to stop b. Along a row it is a straight line.
   Where the road has to drop to the next row it goes round the outside of the
   last card: out past its edge, a rounded corner, straight down, another corner,
   and back in. A single curve would be shorter but cuts across the card. */
function segment(a: Point, b: Point, edge: number | null): string {
  if (edge === null) return `M ${a.x} ${a.y} L ${b.x} ${b.y}`;

  const side = edge > a.x ? 1 : -1;
  const r = Math.min(34, (b.y - a.y) / 2);
  const sweep = side > 0 ? 1 : 0;
  return [
    `M ${a.x} ${a.y}`,
    `L ${edge - side * r} ${a.y}`,
    `A ${r} ${r} 0 0 ${sweep} ${edge} ${a.y + r}`,
    `L ${edge} ${b.y - r}`,
    `A ${r} ${r} 0 0 ${sweep} ${edge - side * r} ${b.y}`,
    `L ${b.x} ${b.y}`,
  ].join(" ");
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

export default function Journey() {
  const mapRef = useRef<HTMLDivElement>(null);
  const [segments, setSegments] = useState<string[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });
  // The stop being pointed at. null means nobody is pointing, and the whole
  // road is lit: the journey so far, end to end.
  const [active, setActive] = useState<number | null>(null);
  const [drawn, setDrawn] = useState(false);
  const [settled, setSettled] = useState(false);
  const pointerType = useRef("mouse");
  const reduced = useReducedMotion();

  useLayoutEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const measure = () => {
      const box = map.getBoundingClientRect();
      const nodes = [...map.querySelectorAll<HTMLElement>(".stop-node")];
      const cards = [...map.querySelectorAll<HTMLElement>(".stop-card")];
      const wide = window.matchMedia(WIDE).matches;

      const points = nodes.map((n) => {
        const r = n.getBoundingClientRect();
        return { x: r.left + r.width / 2 - box.left, y: r.top + r.height / 2 - box.top };
      });

      const next = points.slice(1).map((b, i) => {
        const a = points[i]!;
        // A drop to the next row happens where two stops share a column.
        const drops = wide && Math.abs(a.x - b.x) < 2 && b.y - a.y > 2;
        let edge: number | null = null;
        if (drops) {
          const card = cards[i]!.getBoundingClientRect();
          edge =
            a.x > box.width / 2
              ? card.right - box.left + BEND_CLEARANCE
              : card.left - box.left - BEND_CLEARANCE;
        }
        return segment(a, b, edge);
      });

      setSegments(next);
      setSize({ w: box.width, h: box.height });
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(map);
    // Web fonts can land after the first measure and reflow the cards without
    // changing the map's own size, which the observer would miss.
    void document.fonts?.ready.then(measure);
    return () => ro.disconnect();
  }, []);

  // Draw the road the first time the map comes into view, one segment after
  // another. Once that has finished, the per-segment delays are dropped so
  // hovering responds at once instead of replaying the stagger.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (reduced || !("IntersectionObserver" in window)) {
      setDrawn(true);
      setSettled(true);
      return;
    }
    let timer = 0;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setDrawn(true);
        timer = window.setTimeout(() => setSettled(true), 400 * JOURNEY.length + 600);
        io.disconnect();
      },
      { rootMargin: "0px 0px -20% 0px" },
    );
    io.observe(map);
    return () => {
      io.disconnect();
      window.clearTimeout(timer);
    };
  }, [reduced]);

  const reach = active ?? JOURNEY.length - 1;
  const litPath = segments
    .slice(0, reach)
    .map((d, i) => (i === 0 ? d : d.replace(/^M [^L]+/, "")))
    .join(" ");

  return (
    <section id="journey" className="section journey-section">
      <div className="container">
        <Reveal>
          <SectionHead
            eyebrow="Journey"
            title="How I got"
            accent="here."
            lead="From an electronics degree to running my own Kubernetes cluster. Hover over or tap any stop to trace the road."
          />
        </Reveal>

        <div
          ref={mapRef}
          className={`journey${drawn ? " is-drawn" : ""}${settled ? " is-settled" : ""}`}
          data-pointing={active !== null || undefined}
          onPointerLeave={(e) => e.pointerType === "mouse" && setActive(null)}
        >
          <svg
            className="journey-road"
            width={size.w}
            height={size.h}
            viewBox={`0 0 ${size.w || 1} ${size.h || 1}`}
            aria-hidden="true"
            focusable="false"
          >
            <defs>
              <linearGradient id="journey-grad" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={size.w} y2="0">
                <stop offset="0" style={{ stopColor: "var(--accent)" }} />
                <stop offset="1" style={{ stopColor: "var(--accent-2)" }} />
              </linearGradient>
            </defs>

            {segments.map((d, i) => (
              <path key={`base-${i}`} className="road-base" d={d} />
            ))}
            {segments.map((d, i) => (
              <path
                key={`lit-${i}`}
                className={`road-lit${i < reach ? " is-lit" : ""}`}
                d={d}
                pathLength={1}
                style={{ "--i": i } as React.CSSProperties}
              />
            ))}

            {/* A dot that runs along the lit part of the road. Keyed on the
                path so it restarts from the first stop whenever the lit part
                changes, rather than jumping mid-way along a different road. */}
            {settled && !reduced && reach > 0 && (
              <circle key={litPath} className="road-dot" r="4">
                <animateMotion dur={`${1.3 * reach}s`} repeatCount="indefinite" path={litPath} />
              </circle>
            )}
          </svg>

          <ol className="journey-stops" aria-label="My journey so far">
            {JOURNEY.map((stop, i) => {
              const { row, col } = cell(i);
              const ahead = active !== null && i > active;
              return (
                <li
                  key={stop.title}
                  className={`stop${i === active ? " is-active" : ""}${ahead ? " is-ahead" : ""}${stop.now ? " is-now" : ""}`}
                  style={{ "--row": row, "--col": col, "--i": i } as React.CSSProperties}
                  onPointerDown={(e) => (pointerType.current = e.pointerType)}
                  onPointerEnter={(e) => e.pointerType === "mouse" && setActive(i)}
                  // Touch has no hover, so a tap stands in for it: tap a stop to
                  // trace the road to it, tap it again to see the whole road.
                  onClick={() => {
                    if (pointerType.current !== "mouse") setActive((cur) => (cur === i ? null : i));
                  }}
                >
                  <span className="stop-node" aria-hidden="true">
                    <svg
                      width="22"
                      height="22"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      {GLYPHS[stop.icon]}
                    </svg>
                  </span>

                  <div className="stop-card">
                    <p className="stop-when">
                      {stop.now && <span className="led led--on" aria-hidden="true" />}
                      {stop.when}
                    </p>
                    <h3>{stop.title}</h3>
                    <p className="stop-place">{stop.place}</p>
                    <p className="stop-text">{stop.text}</p>

                    {stop.stat && (
                      <p className="stop-stat">
                        <strong>{stop.stat.value}</strong> {stop.stat.label}
                      </p>
                    )}

                    {stop.tags && (
                      <ul className="chips chips--sm" aria-label="Picked up">
                        {stop.tags.map((tag) => (
                          <li className="chip" key={tag}>
                            {tag}
                          </li>
                        ))}
                      </ul>
                    )}

                    {stop.now && (
                      <Link to="/#contact" className="text-link stop-cta">
                        Get in touch
                        <Icon name="arrow-right" size={14} />
                      </Link>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </section>
  );
}
