/**
 * Custom line-art icons for PTMI's machine types.
 *
 * Deliberately not lucide: these are drawn on one shared 24x24 grid with the same 1.5
 * stroke, round joins, and no fill, so the four machines read as a single schematic
 * family rather than four unrelated glyphs. They inherit `currentColor`, so a tile only
 * has to set a text colour to restyle the icon.
 *
 * Used by the dashboard floor map, the checksheet work-order card, and search results —
 * a machine should be recognizable by shape before its name is read.
 */

function Glyph({ size = 24, className = '', title, children }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role={title ? 'img' : 'presentation'}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {children}
    </svg>
  )
}

/**
 * Open gantry column, spindle head hanging from the beam, cutting tool biting a workpiece
 * on the bed. The gantry is deliberately left open on the right — closing it into a
 * rectangle made the whole glyph read as a plain box.
 */
export function CncMillIcon(props) {
  return (
    <Glyph {...props}>
      <path d="M4.5 18V3.5h12.5" />
      <rect x="11.8" y="5" width="5.4" height="5" rx="1" />
      <path d="M14.5 10v3.3" />
      <path d="M13.2 13.3h2.6L14.5 16z" />
      <path d="M10.5 18v-2h8v2" />
      <rect x="2.5" y="18" width="19" height="3.5" rx="0.75" />
    </Glyph>
  )
}

/** Feed hopper, heated barrel and nozzle, clamped between two mold platens. */
export function InjectionMolderIcon(props) {
  return (
    <Glyph {...props}>
      <path d="M5 2.5h6L9.5 7h-3z" />
      <rect x="2.5" y="7" width="11" height="6" rx="1.25" />
      <path d="M13.5 10h1.8" />
      <rect x="15.3" y="5.5" width="2.6" height="11" rx="0.75" />
      <rect x="18.9" y="5.5" width="2.6" height="11" rx="0.75" />
      <path d="M6 13v7.5" />
      <path d="M2 20.5h20" />
    </Glyph>
  )
}

/** Belt spanning two end rollers, angled support legs, carton riding on top. */
export function ConveyorIcon(props) {
  return (
    <Glyph {...props}>
      <circle cx="5.5" cy="13.5" r="3" />
      <circle cx="18.5" cy="13.5" r="3" />
      <path d="M5.5 10.5h13M5.5 16.5h13" />
      <rect x="8.5" y="4" width="7" height="5" rx="1" />
      <path d="m7.5 16.5-1.5 4M16.5 16.5l1.5 4" />
      <path d="M4 20.5h16" />
    </Glyph>
  )
}

/** Pedestal base, jointed shoulder and elbow, two-prong gripper. */
export function RobotArmIcon(props) {
  return (
    <Glyph {...props}>
      <path d="M4.5 20.5h9" />
      <path d="M7 20.5v-3h4v3" />
      <path d="M9 17.5V11.2" />
      <circle cx="9" cy="9.6" r="1.7" />
      <path d="m10.5 8.8 4.6-2.4" />
      <circle cx="16.6" cy="5.6" r="1.7" />
      <path d="M18.3 5.6h1.6" />
      <path d="M19.9 3.6v4M19.9 3.6h1.8M19.9 7.6h1.8" />
    </Glyph>
  )
}

/** Fallback for any machine added later that doesn't match a known type. */
export function ControlCabinetIcon(props) {
  return (
    <Glyph {...props}>
      <rect x="3" y="3.5" width="18" height="17" rx="2" />
      <path d="M3 9h18" />
      <circle cx="6.5" cy="6.2" r="0.9" />
      <path d="M9.5 6.2h8" />
      <path d="M7 13h10M7 16.5h6" />
    </Glyph>
  )
}

// Order matters: "Packaging Robot B1" must match the robot rule before the loose
// conveyor/"line" rule, and "Conveyor Line 7" must not fall through to the fallback.
const MATCHERS = [
  [/cnc|mill/i, CncMillIcon],
  [/inject|mold|moulder/i, InjectionMolderIcon],
  [/robot|arm|packag/i, RobotArmIcon],
  [/conveyor|belt|line/i, ConveyorIcon],
]

/** Pick the icon for a machine by name or code. Never returns undefined. */
export function iconForMachine(name) {
  const text = String(name ?? '')
  for (const [pattern, Icon] of MATCHERS) {
    if (pattern.test(text)) return Icon
  }
  return ControlCabinetIcon
}
