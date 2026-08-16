/* Hand-rolled icon set.
 *
 * Seven glyphs at 16px, 1.5 stroke, currentColor. Written inline rather than
 * pulling in lucide-react or an icon font: this is roughly 1 KB against ~60 KB
 * for a library we would use seven glyphs of, and it lets the stroke weight be
 * tuned to sit correctly beside the type rather than accepting a default.
 */

export type IconName =
  | "home"
  | "user"
  | "briefcase"
  | "server"
  | "terminal"
  | "book"
  | "mail";

const PATHS: Record<IconName, React.ReactNode> = {
  home: (
    <>
      <path d="M3 9.5 8 3l5 6.5" />
      <path d="M4.5 8.5V13h7V8.5" />
    </>
  ),
  user: (
    <>
      <circle cx="8" cy="5.5" r="2.5" />
      <path d="M3.5 13.5c0-2.2 2-3.8 4.5-3.8s4.5 1.6 4.5 3.8" />
    </>
  ),
  briefcase: (
    <>
      <rect x="2.5" y="5" width="11" height="8" rx="1.2" />
      <path d="M6 5V3.8c0-.4.3-.8.8-.8h2.4c.5 0 .8.4.8.8V5" />
      <path d="M2.5 8.5h11" />
    </>
  ),
  server: (
    <>
      <rect x="2.5" y="2.8" width="11" height="4.4" rx="1" />
      <rect x="2.5" y="8.8" width="11" height="4.4" rx="1" />
      <path d="M5 5h.01M5 11h.01" />
    </>
  ),
  terminal: (
    <>
      <path d="M3.5 4.5 6.5 8l-3 3.5" />
      <path d="M8.5 12h4" />
    </>
  ),
  book: (
    <>
      <path d="M3 3.5h4.2c.7 0 1.3.6 1.3 1.3v8.2c0-.6-.5-1-1.1-1H3z" />
      <path d="M13 3.5H8.8c-.2 0-.3.1-.3.3v9.2c0-.6.5-1 1.1-1H13z" />
    </>
  ),
  mail: (
    <>
      <rect x="2.5" y="3.8" width="11" height="8.4" rx="1.2" />
      <path d="m2.9 5 5.1 3.6L13.1 5" />
    </>
  ),
};

export default function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={{ flex: "none", opacity: 0.85 }}
    >
      {PATHS[name]}
    </svg>
  );
}
