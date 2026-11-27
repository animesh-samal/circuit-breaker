import { EMAIL } from "../../content/profile";
import {
  WALL_CODE,
  WALL_STACK,
  type TunnelCard,
  type TunnelData,
  type WallMaterial,
} from "../../content/tunnel";

/* The faces of the cards. Each featured card is a tiny web page about one thing
 * I have done, and the wall cards are scenery in the same style. They are art:
 * their colours are fixed and deliberately do not follow the site theme, the way
 * a screenshot of someone else's website would not. Everything they say comes
 * from content/tunnel.ts. */

/* Distance between slots along a wall, shared with the camera. */
export const SLOT = 420;

function Bar({ url }: { url: string }) {
  return (
    <div className="tf-bar" aria-hidden="true">
      <b />
      <b />
      <b />
      <span>{url}</span>
    </div>
  );
}

/* ---------- the seven featured cards ---------- */

export function FeaturedFace({ card, data }: { card: TunnelCard; data: TunnelData }) {
  switch (card.face) {
    case "hello":
      return (
        <>
          <Bar url="animesh.space" />
          <div className="tf-pg tf-hello">
            <div className="tf-hello-text">
              <div className="tf-nv">
                <span>Animesh Samal</span>
              </div>
              <div className="tf-hello-body">
                <div className="tf-hd tf-hd--xl">
                  Hi, I&rsquo;m <i>Animesh.</i>
                </div>
                <p className="tf-sm">I build and look after the pipelines that put code in front of users.</p>
                <span className="tf-pill">Say hello</span>
              </div>
            </div>
            <div className="tf-hello-photo" />
          </div>
        </>
      );

    case "work":
      return (
        <>
          <Bar url="work" />
          <div className="tf-pg tf-deloitte">
            <div className="tf-nv">
              <span>{data.job.company}</span>
              <span>
                {data.job.stack.slice(0, 3).map((s) => (
                  <span key={s}>{s}</span>
                ))}
              </span>
            </div>
            <div className="tf-hd tf-hd--l">{data.job.role}</div>
            <div className="tf-big tf-deloitte-num">
              {data.second.value}
              <small> {data.second.label}</small>
            </div>
            <div className="tf-bars" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
              <i />
            </div>
          </div>
        </>
      );

    case "numbers":
      return (
        <>
          <Bar url="in numbers" />
          <div className="tf-pg tf-releases">
            <div className="tf-nv">
              <span>{data.job.company}</span>
              <span>
                {data.job.stack.slice(0, 3).map((s) => (
                  <span key={s}>{s}</span>
                ))}
              </span>
            </div>
            <div className="tf-big tf-releases-num">{data.lead.value}</div>
            <p className="tf-sm">{data.lead.label}</p>
            <svg className="tf-branch" viewBox="0 0 520 70" aria-hidden="true">
              <path d="M0 50H520M60 50C90 50 90 18 130 18H250M250 18C290 18 290 50 330 50" />
              <circle cx="60" cy="50" r="5" />
              <circle cx="250" cy="18" r="5" />
              <circle cx="330" cy="50" r="5" />
              <circle className="tf-branch-end" cx="450" cy="50" r="5" />
            </svg>
          </div>
        </>
      );

    case "project": {
      const project = card.project;
      return (
        <>
          <Bar url={project ? project.title.toLowerCase() : "project"} />
          <div className={`tf-pg tf-project tf-project--${card.tone % 4}`}>
            <div className="tf-nv">
              <span>{project?.title}</span>
              <span>
                {project?.stack.slice(0, 3).map((s) => (
                  <span key={s}>{s}</span>
                ))}
              </span>
            </div>
            <div className="tf-hd tf-hd--l">{card.say}</div>
            {project?.flow && <p className="tf-mono tf-flow">{project.flow.replace(/ \([^)]*\)/g, "")}</p>}
            {card.tone % 4 === 1 && (
              <>
                <div className="tf-sun" aria-hidden="true" />
                <div className="tf-panel" aria-hidden="true" />
              </>
            )}
            {(project?.live || project?.source) && (
              <span className="tf-pill tf-project-pill">{project.live ? "Live" : "Source"}</span>
            )}
          </div>
        </>
      );
    }

    case "skills":
      return (
        <>
          <Bar url="stack" />
          <div className="tf-pg tf-skills">
            <div className="tf-nv">
              <span>What I work with</span>
            </div>
            <div className="tf-hd tf-hd--l">Tools I use every day.</div>
            <div className="tf-chips">
              {data.skillChips.map((s) => (
                <span className="tf-chip" key={s}>
                  {s}
                </span>
              ))}
            </div>
          </div>
        </>
      );

    case "contact":
      return (
        <>
          <Bar url="contact" />
          <div className="tf-pg tf-contact">
            <div className="tf-nv">
              <span>Hyderabad · IST</span>
              <span>
                <span>Remote or hybrid</span>
              </span>
            </div>
            <div className="tf-hd tf-hd--xxl">
              Let&rsquo;s <i>talk.</i>
            </div>
            <p className="tf-mono tf-contact-mail">{EMAIL}</p>
            <div className="tf-contact-pills">
              <span className="tf-pill tf-pill--solid">LinkedIn</span>
              <span className="tf-pill tf-pill--line">GitHub</span>
              <span className="tf-pill tf-pill--line">CV</span>
            </div>
          </div>
        </>
      );
  }
}

/* ---------- the walls ---------- */

type Side = "L" | "R" | "F" | "C";
type WallKind = "page" | "number" | "photo" | "code" | "stack";

export interface Wall {
  side: Side;
  /* Where it sits across the wall: y on the side walls, x on the floor and ceiling. */
  a: number;
  /* Its slot along the tunnel, and a half-slot shift so the rows are not a grid. */
  k: number;
  off: number;
  kind: WallKind;
  bg: string;
  fg: string;
  ac: string;
  dark: boolean;
  text: string;
  sub: string;
  lines: string[];
  chips: string[];
  pos: string;
  zoom: number;
  mono: boolean;
}

/* A small seeded generator, so the walls look the same on every visit and in
   every render. Math.random would reshuffle them each time. */
function rng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* [background, text, accent] */
const PALETTES: Array<[string, string, string]> = [
  ["#f1ece3", "#1b1a18", "#d9501a"],
  ["#f08a24", "#1a1208", "#ffffff"],
  ["#0d0d10", "#f4f1ea", "#3b9eff"],
  ["#0b1b3a", "#e9f0ff", "#2ad4d0"],
  ["#cfe0c9", "#16301f", "#d9501a"],
  ["#d9d0f5", "#241a4a", "#6b3cf0"],
  ["#c8321e", "#ffffff", "#ffd9a0"],
  ["#fafafa", "#111111", "#e0446f"],
  ["#f2c94c", "#2a1f05", "#2a1f05"],
  ["#16171c", "#e8e8ea", "#ff9a3c"],
];

const KINDS: WallKind[] = ["page", "number", "photo", "code", "stack"];

function pick<T>(list: readonly T[], r: () => number): T {
  // The lists are never empty, so the fallback only satisfies the type checker.
  return list[Math.floor(r() * list.length)] ?? (list[0] as T);
}

function makeWall(
  r: () => number,
  material: WallMaterial,
  side: Side,
  a: number,
  k: number,
  off: number,
): Wall {
  const kind = KINDS[Math.floor(r() * KINDS.length)] ?? "page";
  const palette = pick(PALETTES, r);
  let bg = palette[0];
  let fg = palette[1];
  const ac = palette[2];
  let dark = bg.charAt(1) < "8" && bg !== "#c8321e";
  const number = pick(material.numbers, r);
  const lines = pick(WALL_CODE, r);
  const chipCount = 5 + Math.floor(r() * 3);

  if (kind === "photo") {
    bg = "#222222";
    fg = "#ffffff";
  }
  if (kind === "code") {
    bg = "#0c1210";
    fg = "#cfe8d8";
    dark = true;
  }

  return {
    side,
    a,
    k,
    off,
    kind,
    bg,
    fg,
    ac,
    dark,
    text: kind === "number" ? number[0] : pick(material.phrases.length ? material.phrases : [""], r),
    sub: number[1],
    lines,
    chips: WALL_STACK.slice(0, chipCount),
    pos: pick(["50% 8%", "40% 30%", "55% 55%", "45% 20%"], r),
    zoom: 120 + Math.floor(r() * 80),
    mono: r() < 0.5,
  };
}

/* Left and right walls get three rows, the floor and ceiling four columns. Each
   row is shifted by half a slot from its neighbour. */
export function buildWalls(slots: number, material: WallMaterial): Wall[] {
  const r = rng(21);
  const walls: Wall[] = [];
  const add = (side: Side, a: number, off: number) => {
    for (let k = 0; k < slots; k++) walls.push(makeWall(r, material, side, a, k, off));
  };
  [-262, 0, 262].forEach((y, row) => {
    add("L", y, (row % 2) * (SLOT / 2));
    add("R", y, ((row + 1) % 2) * (SLOT / 2));
  });
  [-570, -190, 190, 570].forEach((x, col) => {
    add("F", x, (col % 2) * (SLOT / 2));
    add("C", x, ((col + 1) % 2) * (SLOT / 2));
  });
  return walls;
}

export function WallFace({ wall }: { wall: Wall }) {
  switch (wall.kind) {
    case "page":
      return (
        <>
          <Bar url="" />
          <div className="tf-pg tf-w-page">
            <div className="tf-nv tf-nv--tiny">
              <span>● AS</span>
              <span>
                <span>Work</span>
                <span>About</span>
              </span>
            </div>
            <div className="tf-hd tf-hd--m">{wall.text}</div>
            <p className="tf-sm">Notes from running it in production.</p>
            <span className="tf-pill tf-pill--accent">Read more</span>
          </div>
        </>
      );

    case "number":
      return (
        <div className="tf-pg tf-w-number">
          <div className="tf-big">{wall.text}</div>
          <p>{wall.sub}</p>
        </div>
      );

    case "photo":
      return (
        <>
          <div
            className="tf-w-photo"
            style={{
              backgroundPosition: wall.pos,
              backgroundSize: `${wall.zoom}% auto`,
              filter: wall.mono ? "grayscale(1) contrast(1.1)" : "sepia(.35) saturate(1.2)",
            }}
          />
          <div className="tf-w-name">Animesh Samal</div>
        </>
      );

    case "code":
      return (
        <>
          <Bar url="zsh" />
          <div className="tf-pg tf-mono tf-w-code">
            {wall.lines.map((line, i) => (
              <div key={line} className={i === 0 ? "is-cmd" : undefined}>
                {line}
              </div>
            ))}
          </div>
        </>
      );

    case "stack":
      return (
        <div className="tf-pg tf-w-stack">
          <div className="tf-nv tf-nv--tiny">
            <span>Stack</span>
          </div>
          <div className="tf-hd tf-hd--s">What I work with</div>
          <div className="tf-chips">
            {wall.chips.map((c) => (
              <span className="tf-chip tf-chip--small" key={c}>
                {c}
              </span>
            ))}
          </div>
        </div>
      );
  }
}
