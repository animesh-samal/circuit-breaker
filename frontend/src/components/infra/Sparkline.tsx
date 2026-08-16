/* Sparkline drawn by hand rather than via a chart library.
 *
 * Recharts or Chart.js would add 90–180 KB gzipped for what is a polyline and a
 * fill. At this size the library costs more than the feature.
 */

interface Props {
  values: number[];
  height?: number;
  stroke?: string;
}

export default function Sparkline({ values, height = 40, stroke = "var(--accent)" }: Props) {
  if (values.length < 2) {
    return (
      <div className="mono" style={{ fontSize: "0.6875rem", color: "var(--text-mute)", height }}>
        no data
      </div>
    );
  }

  const width = 200;
  const max = Math.max(...values);
  const min = Math.min(...values);
  // A flat series would divide by zero; render it as a centred straight line.
  const span = max - min || 1;

  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - ((v - min) / span) * (height - 6) - 3;
    return [x, y] as const;
  });

  const line = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `0,${height} ${line} ${width},${height}`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      style={{ width: "100%", height, display: "block" }}
      aria-hidden="true"
    >
      <polygon points={area} fill={stroke} opacity="0.12" />
      <polyline
        points={line}
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={points[points.length - 1]![0]} cy={points[points.length - 1]![1]} r="2.5" fill={stroke} />
    </svg>
  );
}
