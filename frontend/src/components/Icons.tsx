/* Hand-rolled icon set.
 *
 * Nine glyphs at 16px, 1.4 stroke, currentColor. Written inline rather than
 * pulling in lucide-react or an icon font: this is roughly 1.5 KB against ~60 KB
 * for a library we would use nine glyphs of, and it lets the stroke weight be
 * tuned to sit correctly beside the type rather than accepting a default.
 *
 * The GitHub mark is the one filled glyph -- an outline version of it stops
 * being recognisable at 16px.
 */

export type IconName =
  | "mail"
  | "github"
  | "linkedin"
  | "download"
  | "arrow-right"
  | "arrow-up-right"
  | "menu"
  | "close"
  | "contrast";

const PATHS: Record<IconName, React.ReactNode> = {
  mail: (
    <>
      <rect x="2.5" y="3.8" width="11" height="8.4" rx="1.2" />
      <path d="m2.9 5 5.1 3.6L13.1 5" />
    </>
  ),
  github: (
    <path
      fill="currentColor"
      stroke="none"
      d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z"
    />
  ),
  linkedin: (
    <>
      <rect x="2.3" y="2.3" width="11.4" height="11.4" rx="2" />
      <path d="M5.3 7.2v4.3M5.3 4.9v.01M8 11.5V7.2M8 9.2c0-1.2.8-2 1.9-2s1.8.8 1.8 2v2.3" />
    </>
  ),
  download: <path d="M8 2.5v8M4.5 7 8 10.5 11.5 7M3 13.5h10" />,
  "arrow-right": <path d="M3 8h10M9 4l4 4-4 4" />,
  "arrow-up-right": <path d="M5 11 11 5M6 5h5v5" />,
  menu: <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" />,
  close: <path d="m4 4 8 8M12 4l-8 8" />,
  contrast: (
    <>
      <circle cx="8" cy="8" r="5.5" />
      <path d="M8 2.5a5.5 5.5 0 0 1 0 11Z" fill="currentColor" />
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
      style={{ flex: "none" }}
    >
      {PATHS[name]}
    </svg>
  );
}
