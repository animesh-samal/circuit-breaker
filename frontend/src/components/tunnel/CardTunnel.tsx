import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";

import { CV } from "../../content/profile";
import { buildTunnel, type TunnelCard } from "../../content/tunnel";
import { useContent } from "../../lib/content";
import { useReducedMotion } from "../../lib/useReducedMotion";
import "../../styles/tunnel.css";
import LiveBadge from "../home/LiveBadge";
import Icon from "../Icons";
import { FeaturedFace, SLOT, WallFace, buildWalls } from "./faces";

/* The card tunnel: the first screen of the home page.
 *
 * Seven cards, one per thing about me, run down the middle of a corridor whose
 * walls are made of smaller cards. The camera moves down the corridor as the
 * page scrolls.
 *
 * Scrolling drives it instead of the wheel being captured. The section is tall
 * and the corridor stays pinned while you scroll through it, so the browser's
 * own scrolling, touch swipes, keys and the quick jump menu all keep working.
 * Nothing here ever traps the scroll.
 *
 * Perspective lives on each card, in its own transform, not on a shared parent.
 * The usual way (perspective on a wrapper, preserve-3d on the layers below it)
 * depends on every layer in between keeping the 3D, and Safari flattens that
 * chain: the whole corridor collapses into a flat row. A card that carries its
 * own perspective draws the same picture in every browser. The price is that
 * the browser no longer sorts the cards by depth, so we do it by hand with
 * z-index.
 *
 * It is a picture: the same content is in the "Step inside" panel and in the
 * ordinary sections below, so the corridor itself is hidden from screen readers.
 * Cards are placed by a small loop that writes transforms straight to the
 * elements, because re-rendering a hundred cards sixty times a second in React
 * would be far slower than it needs to be.
 *
 * There is one tunnel for every screen. Only the scale and a few offsets change
 * with the shape of the screen (see measure below), never the content, the
 * controls or the number of cards. */

const FEATURE_GAP = 720; // distance between featured cards along the corridor
const NEAR = 180; // cards are removed once they pass this close to the camera
const HALF_WIDTH = 760;
const HALF_HEIGHT = 440;
const PERSPECTIVE = 1000;
const SLOTS = 8; // cards along each wall

type Layout = "landscape" | "portrait";

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/* A screen that is clearly taller than it is wide gets the portrait layout. */
function layoutFor(width: number, height: number): Layout {
  return height > width * 1.05 ? "portrait" : "landscape";
}

interface Camera {
  cz: number; // where the camera is
  tz: number; // where scrolling says it should be
  k: number; // scale of the whole picture, so it fits the screen
  fx: number; // x of the featured card in front of the camera
  sw: number; // how far the line of featured cards sweeps sideways
  lz: number; // length of the repeating stretch of wall
  px: number; // pointer sway, smoothed
  py: number;
  tpx: number; // pointer sway, target
  tpy: number;
  start: number; // page scroll position where the corridor starts to move
  scrollable: number; // how far the page scrolls while it is pinned
  visible: boolean;
  raf: number;
  needs: boolean;
  // Set once the opening glide has been set up, so new content does not replay it.
  started: boolean;
}

function InsideBody({ card }: { card: TunnelCard }) {
  const { inside } = card;
  return (
    <>
      <h2 id="tn-dialog-title" className="tn-dialog-title">
        {card.name}
      </h2>
      <p className="tn-dialog-sub">{inside.sub}</p>

      {inside.paragraphs?.map((p) => (
        <p key={p} className="tn-dialog-text">
          {p}
        </p>
      ))}

      {inside.points && (
        <ul className="tn-dialog-points">
          {inside.points.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}

      {inside.flow && <p className="tn-dialog-flow mono">{inside.flow}</p>}

      {inside.facts && (
        <dl className="tn-dialog-facts">
          {inside.facts.map((f) => (
            <div key={f.label}>
              <dt>{f.label}</dt>
              <dd>{f.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {inside.chips && (
        <ul className="chips" aria-label="Tools">
          {inside.chips.map((c) => (
            <li className="chip" key={c}>
              {c}
            </li>
          ))}
        </ul>
      )}

      {inside.links && inside.links.length > 0 && (
        <div className="tn-dialog-links">
          {inside.links.map((l) =>
            l.internal ? (
              <Link key={l.label} to={l.href} className="btn btn-ghost">
                {l.label}
                <Icon name="arrow-right" size={14} />
              </Link>
            ) : (
              <a key={l.label} href={l.href} className="btn btn-ghost">
                {l.label}
                <Icon name="arrow-up-right" size={14} />
              </a>
            ),
          )}
        </div>
      )}
    </>
  );
}

export default function CardTunnel() {
  const reduced = useReducedMotion();
  // The cards follow the saved content: add a project and it gets a card.
  const content = useContent();
  const data = useMemo(() => buildTunnel(content), [content]);
  const cards = data.cards;
  const N = cards.length;
  const walls = useMemo(() => buildWalls(SLOTS, data.material), [data.material]);

  const [cur, setCur] = useState(0);
  const [inside, setInside] = useState(false);
  const [layout, setLayout] = useState<Layout>(() => layoutFor(window.innerWidth, window.innerHeight));

  const trackRef = useRef<HTMLElement>(null);
  const stickyRef = useRef<HTMLDivElement>(null);
  const indexRef = useRef<HTMLUListElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const wallEls = useRef<Array<HTMLDivElement | null>>([]);
  const featEls = useRef<Array<HTMLDivElement | null>>([]);
  const curRef = useRef(0);
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;

  const cam = useRef<Camera>({
    cz: 0,
    tz: 0,
    k: 1,
    fx: -230,
    sw: 360,
    lz: SLOTS * SLOT,
    px: 0,
    py: 0,
    tpx: 0,
    tpy: 0,
    start: 0,
    scrollable: 1,
    visible: false,
    raf: 0,
    needs: true,
    started: false,
  });

  /* Scroll to the spot where card i is in front of the camera. The numbers it
     needs are measured once per resize, not on every call. */
  const goTo = useCallback((i: number) => {
    const c = cam.current;
    const index = clamp(i, 0, N - 1);
    window.scrollTo({
      top: c.start + (index / (N - 1)) * c.scrollable,
      behavior: reducedRef.current ? "auto" : "smooth",
    });
  }, [N]);

  useEffect(() => {
    const track = trackRef.current;
    const sticky = stickyRef.current;
    if (!track || !sticky) return;
    const c = cam.current;
    c.lz = SLOTS * SLOT;
    // Open a little way back so the first card glides into place. Only the
    // first time: when saved content arrives a moment later the effect runs
    // again, and replaying the glide would look like a glitch.
    if (!c.started) {
      c.started = true;
      c.cz = reduced ? 0 : -FEATURE_GAP * 0.6;
    }
    let last = performance.now();

    const draw = () => {
      // Shared by every card: scale to fit the screen, then project. The
      // sway moves the vanishing point a little with the pointer.
      const vx = c.px * 50;
      const vy = c.py * 30;
      const pre = `scale(${c.k.toFixed(4)}) translate(${vx.toFixed(1)}px,${vy.toFixed(1)}px) perspective(${PERSPECTIVE}px) translate(${(-vx).toFixed(1)}px,${(-vy).toFixed(1)}px) `;

      for (let i = 0; i < walls.length; i++) {
        const el = wallEls.current[i];
        const w = walls[i];
        if (!el || !w) continue;
        let z = -w.k * SLOT - w.off + c.cz;
        while (z > NEAR) z -= c.lz;
        while (z <= NEAR - c.lz) z += c.lz;
        const o = clamp((z - (NEAR - c.lz)) / (c.lz * 0.35), 0, 1) * clamp((NEAR - z) / 1000, 0, 1) * 0.7;
        if (o < 0.01) {
          el.style.visibility = "hidden";
          continue;
        }
        let t: string;
        if (w.side === "L") t = `translate3d(${-HALF_WIDTH}px,${w.a}px,${z}px) rotateY(90deg)`;
        else if (w.side === "R") t = `translate3d(${HALF_WIDTH}px,${w.a}px,${z}px) rotateY(-90deg)`;
        else if (w.side === "F") t = `translate3d(${w.a}px,${HALF_HEIGHT}px,${z}px) rotateX(90deg)`;
        else t = `translate3d(${w.a}px,${-HALF_HEIGHT}px,${z}px) rotateX(-90deg)`;
        el.style.transform = pre + t;
        el.style.opacity = o.toFixed(3);
        // Nearer cards paint over farther ones.
        el.style.zIndex = String(Math.round(z + 5000));
        el.style.visibility = "visible";
      }

      for (let j = 0; j < N; j++) {
        const el = featEls.current[j];
        if (!el) continue;
        const z = -j * FEATURE_GAP + c.cz;
        const o = clamp((380 - z) / 260, 0, 1) * clamp(1 - -z / 3000, 0, 1);
        if (o < 0.01) {
          el.style.visibility = "hidden";
          el.style.pointerEvents = "none";
          continue;
        }
        const x = c.fx + c.sw * (j - c.cz / FEATURE_GAP);
        el.style.transform = `${pre}translate3d(${x.toFixed(1)}px,-10px,${z.toFixed(1)}px) rotateY(14deg) rotateX(2deg)`;
        el.style.opacity = o.toFixed(3);
        el.style.zIndex = String(Math.round(z + 5000));
        el.style.visibility = "visible";
        el.style.pointerEvents = o > 0.5 ? "auto" : "none";
      }
    };

    /* Work out the scale and offsets for this screen, and where the page has
       to be scrolled to for the corridor to start and finish moving. The same
       tunnel is drawn everywhere; a tall narrow screen just fits the front card
       to its width and centres it, while a wide one leaves it left of centre. */
    const measure = () => {
      const w = sticky.clientWidth;
      const h = sticky.clientHeight;
      const next = layoutFor(w, h);
      setLayout((prev) => (prev === next ? prev : next));
      if (next === "portrait") {
        c.k = clamp((w - 32) / 600, 0.5, 1);
        c.fx = 0;
        c.sw = 240;
      } else {
        c.k = clamp(Math.min(w / 1280, h / 760), 0.42, 1);
        c.fx = -230;
        c.sw = 360;
      }
      const pinnedAt = parseFloat(getComputedStyle(sticky).top) || 0;
      c.start = track.getBoundingClientRect().top + window.scrollY - pinnedAt;
      c.scrollable = Math.max(1, track.offsetHeight - sticky.clientHeight);
      c.needs = true;
    };

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      // Where the page is scrolled to says where the camera should be.
      const p = clamp((window.scrollY - c.start) / c.scrollable, 0, 1);
      c.tz = p * (N - 1) * FEATURE_GAP;
      const index = Math.round(p * (N - 1));
      if (index !== curRef.current) {
        curRef.current = index;
        setCur(index);
      }

      const diff = c.tz - c.cz;
      if (reducedRef.current) {
        if (diff !== 0) {
          c.cz = c.tz;
          c.needs = true;
        }
      } else if (Math.abs(diff) > 0.2) {
        c.cz += diff * (1 - Math.exp(-dt * 5));
        c.needs = true;
      } else if (diff !== 0) {
        c.cz = c.tz;
        c.needs = true;
      }

      if (Math.abs(c.tpx - c.px) > 0.002 || Math.abs(c.tpy - c.py) > 0.002) {
        const ease = 1 - Math.exp(-dt * 3);
        c.px += (c.tpx - c.px) * ease;
        c.py += (c.tpy - c.py) * ease;
        c.needs = true;
      }

      if (c.needs) {
        draw();
        c.needs = false;
      }
      c.raf = requestAnimationFrame(frame);
    };

    /* The loop only runs while the corridor is on screen. */
    const io = new IntersectionObserver(
      ([entry]) => {
        c.visible = Boolean(entry?.isIntersecting);
        if (c.visible && !c.raf) {
          last = performance.now();
          c.raf = requestAnimationFrame(frame);
        } else if (!c.visible && c.raf) {
          cancelAnimationFrame(c.raf);
          c.raf = 0;
        }
      },
      { rootMargin: "100px" },
    );
    io.observe(track);

    const ro = new ResizeObserver(measure);
    ro.observe(sticky);
    ro.observe(track);

    const onPointer = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const r = sticky.getBoundingClientRect();
      c.tpx = ((e.clientX - r.left) / r.width - 0.5) * 2;
      c.tpy = ((e.clientY - r.top) / r.height - 0.5) * 2;
    };
    const onLeave = () => {
      c.tpx = 0;
      c.tpy = 0;
    };

    /* Left and right arrows step through the cards while the corridor is what
       you are looking at. Up and down are left alone: they scroll the page. */
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      if (document.querySelector("dialog[open]")) return;
      const r = sticky.getBoundingClientRect();
      if (!(r.top < window.innerHeight * 0.5 && r.bottom > window.innerHeight * 0.5)) return;
      e.preventDefault();
      goTo(curRef.current + (e.key === "ArrowRight" ? 1 : -1));
    };

    measure();
    draw();
    // Web fonts and late layout can move the track a little; measure again.
    void document.fonts?.ready.then(measure);
    window.addEventListener("load", measure);
    window.addEventListener("resize", measure);
    window.addEventListener("keydown", onKey);
    sticky.addEventListener("pointermove", onPointer);
    sticky.addEventListener("pointerleave", onLeave);

    return () => {
      io.disconnect();
      ro.disconnect();
      if (c.raf) cancelAnimationFrame(c.raf);
      c.raf = 0;
      window.removeEventListener("load", measure);
      window.removeEventListener("resize", measure);
      window.removeEventListener("keydown", onKey);
      sticky.removeEventListener("pointermove", onPointer);
      sticky.removeEventListener("pointerleave", onLeave);
    };
  }, [walls, reduced, goTo, N]);

  /* The detail panel is a native dialog: it traps focus, closes on Escape and
     returns focus to the button that opened it, with no code of ours. */
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (inside && !dialog.open) dialog.showModal();
    if (!inside && dialog.open) dialog.close();
  }, [inside]);

  /* On a tall screen the index is a row of chips that scrolls sideways; keep
     the current one in view. Scrolling the row directly, not scrollIntoView,
     so the page itself never moves. */
  useEffect(() => {
    const list = indexRef.current;
    const chip = list?.children[cur] as HTMLElement | undefined;
    if (!list || !chip || list.scrollWidth <= list.clientWidth) return;
    // Instant, not smooth: the page is scrolling at the same time, and a smooth
    // scroll of the row is cancelled when that happens.
    list.scrollLeft = chip.offsetLeft - (list.clientWidth - chip.offsetWidth) / 2;
  }, [cur, layout]);

  const card = cards[Math.min(cur, N - 1)] ?? cards[0];
  if (!card) return null;

  return (
    <section
      id="home"
      ref={trackRef}
      className="tn-track"
      aria-labelledby="tn-heading"
      style={{ "--steps": N - 1 } as CSSProperties}
    >
      <div className="tn" ref={stickyRef} data-layout={layout}>
        <h1 id="tn-heading" className="sr-only">
          Animesh Samal, DevOps engineer in Hyderabad
        </h1>

        {/* The corridor is a picture. Everything in it is also in the detail
            panel and the sections below, in order. */}
        <div className="tn-stage" aria-hidden="true">
          <div className="tn-rig">
            {walls.map((w, i) => (
              <div
                key={i}
                ref={(el) => {
                  wallEls.current[i] = el;
                }}
                className={`tn-card tn-wall${w.dark ? " is-dark" : ""}`}
                style={{ "--f-bg": w.bg, "--f-fg": w.fg, "--f-ac": w.ac } as CSSProperties}
              >
                <WallFace wall={w} />
              </div>
            ))}
            {cards.map((c, i) => (
              <div
                key={c.id}
                ref={(el) => {
                  featEls.current[i] = el;
                }}
                className="tn-card tn-feat"
                data-face={c.face}
                data-tone={c.tone % 4}
                onClick={() => (i === curRef.current ? setInside(true) : goTo(i))}
              >
                <FeaturedFace card={c} data={data} />
              </div>
            ))}
          </div>
        </div>
        <div className="tn-fog" aria-hidden="true" />

        <nav className="tn-index" aria-label="Portfolio cards">
          <p className="tn-index-head">Index</p>
          <ul ref={indexRef}>
            {cards.map((c, i) => (
              <li key={c.id}>
                <button type="button" aria-current={i === cur ? "true" : undefined} onClick={() => goTo(i)}>
                  {c.name}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="tn-live">
          <p className="tn-hint">
            <span className="tn-hint-keys">
              Scroll to move through <kbd>←</kbd>
              <kbd>→</kbd>
            </span>
            <span className="tn-hint-touch">Swipe to move through</span>
          </p>
          <LiveBadge />
        </div>

        <div className="tn-cap" aria-live="polite">
          <div className="tn-count mono">
            <span>
              {String(cur + 1).padStart(2, "0")} / {String(N).padStart(2, "0")}
            </span>
            <i style={{ "--p": (cur + 1) / N } as CSSProperties} aria-hidden="true" />
          </div>
          <h2 key={card.id} className="tn-title">
            {card.name}
          </h2>
          <p className="tn-kind">{card.kind}</p>
          <p className="tn-say">{card.say}</p>
          <div className="tn-acts">
            <span className="tn-arrows">
              <button type="button" aria-label="Previous card" disabled={cur === 0} onClick={() => goTo(cur - 1)}>
                &larr;
              </button>
              <button type="button" aria-label="Next card" disabled={cur === N - 1} onClick={() => goTo(cur + 1)}>
                &rarr;
              </button>
            </span>
            <button type="button" className="tn-step" onClick={() => setInside(true)}>
              Step inside
              <Icon name="arrow-right" size={14} />
            </button>
            <a href={CV} download className="tn-cv">
              <Icon name="download" size={14} />
              Download CV
            </a>
          </div>
          <Link className="tn-skip" to="/#about">
            Skip to the short version
          </Link>
        </div>
      </div>

      <dialog
        ref={dialogRef}
        className="tn-dialog"
        aria-labelledby="tn-dialog-title"
        onClose={() => setInside(false)}
        onClick={(e) => {
          if (e.target === e.currentTarget) setInside(false);
        }}
      >
        <div className="tn-dialog-panel">
          <button type="button" className="tn-dialog-close" aria-label="Close" onClick={() => setInside(false)}>
            <Icon name="close" size={16} />
          </button>
          <InsideBody card={card} />
        </div>
      </dialog>
    </section>
  );
}
