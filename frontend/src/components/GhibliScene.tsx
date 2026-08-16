/* Decorative background for the Ghibli theme.
 *
 * Fixed behind the page, pointer-events none, aria-hidden -- it must never
 * intercept a click or be announced to a screen reader.
 *
 * Everything moves via transform and opacity only. Those are the two properties
 * the compositor can animate without touching layout or paint, so the scene
 * costs effectively nothing per frame. Animating `left` or `background-position`
 * instead would repaint the full viewport sixty times a second.
 *
 * Rendered only when the Ghibli theme is active, so every other theme pays
 * nothing at all -- not even the DOM nodes.
 */

const CLOUDS = [
  { top: "8%", scale: 1, duration: 96, delay: 0, opacity: 0.85 },
  { top: "18%", scale: 0.68, duration: 132, delay: -40, opacity: 0.6 },
  { top: "30%", scale: 1.25, duration: 168, delay: -90, opacity: 0.45 },
  { top: "44%", scale: 0.55, duration: 148, delay: -20, opacity: 0.4 },
];

const MOTES = Array.from({ length: 14 }, (_, i) => ({
  left: `${(i * 7.3 + 4) % 96}%`,
  size: 3 + ((i * 5) % 4),
  duration: 16 + ((i * 3) % 12),
  delay: -(i * 2.4),
}));

function Cloud({ opacity }: { opacity: number }) {
  return (
    <svg width="220" height="86" viewBox="0 0 220 86" fill="none" style={{ opacity }}>
      <path
        d="M28 74c-14 0-24-9-24-20s10-19 22-19c2-13 14-24 29-24 12 0 22 6 27 15 5-4 11-6 18-6 15 0 27 10 30 24 13 1 23 10 23 21 0 6-3 9-6 9z"
        fill="#fdfdfa"
      />
      <path
        d="M110 74c-9 0-16-6-16-13s7-13 15-13c2-9 10-16 20-16 8 0 15 4 18 10 3-2 7-4 12-4 10 0 18 7 20 16 9 1 16 7 16 15 0 4-2 5-4 5z"
        fill="#ffffff"
        opacity="0.9"
      />
    </svg>
  );
}

export default function GhibliScene() {
  return (
    <div className="ghibli-scene" aria-hidden="true">
      <div className="ghibli-sky" />
      <div className="ghibli-sun" />

      {CLOUDS.map((c, i) => (
        <div
          key={i}
          className="ghibli-cloud"
          style={{
            top: c.top,
            animationDuration: `${c.duration}s`,
            animationDelay: `${c.delay}s`,
            transform: `scale(${c.scale})`,
          }}
        >
          <Cloud opacity={c.opacity} />
        </div>
      ))}

      {MOTES.map((m, i) => (
        <span
          key={i}
          className="ghibli-mote"
          style={{
            left: m.left,
            width: m.size,
            height: m.size,
            animationDuration: `${m.duration}s`,
            animationDelay: `${m.delay}s`,
          }}
        />
      ))}

      {/* Three hill bands. Each is a separate layer with its own drift speed, so
          the horizon parallaxes very slightly as the clouds cross it. */}
      <svg className="ghibli-hills" viewBox="0 0 1440 420" preserveAspectRatio="none">
        <path
          d="M0 250c150-52 260 26 420 8s250-84 400-56 260 96 420 66 200-62 200-62v214H0z"
          fill="#a8c48a"
          opacity="0.55"
        />
        <path
          d="M0 300c180-40 280 42 460 30s280-72 440-40 300 84 540 40v190H0z"
          fill="#7fa869"
          opacity="0.7"
        />
        <path
          d="M0 356c200-30 320 34 520 22s300-52 460-26 260 44 460 20v148H0z"
          fill="#5c8a52"
          opacity="0.85"
        />
      </svg>

      <div className="ghibli-grass" />
    </div>
  );
}
