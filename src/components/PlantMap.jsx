import { iconForMachine } from './machineIcons'
import { useI18n } from '../lib/i18n'

/**
 * Plant floor map — the dashboard's visual centerpiece.
 *
 * One tile per machine, styled as a panel on a control cabinet: dark steel, blueprint
 * grid, schematic machine icon, and a status light. Status is derived here from data the
 * dashboard already holds plus the machine's own PM due state — nothing new is computed
 * server-side, and no record is modified.
 *
 * Only amber and red lights animate. A healthy plant is visually still, so any movement
 * on this panel means "look here".
 */

const STATUS = {
  critical: { key: 'dash.critical', color: '#c1342b', pulse: true },
  caution: { key: 'dash.caution', color: '#e97132', pulse: true },
  nominal: { key: 'dash.nominal', color: '#1f8a4c', pulse: false },
}

/**
 * Red   = PM overdue, or an open High-severity finding.
 * Amber = any other open finding, or a part request waiting on approval.
 * Green = neither.
 */
function deriveStatus(machineName, dueTone, findings, approvals) {
  const mine = findings.filter((f) => f.machine === machineName)
  const pending = approvals.filter((a) => a.machine === machineName && a.status === 'pending')
  const overdue = dueTone === 'accent'
  const high = mine.filter((f) => f.severity === 'High').length

  const key = overdue || high > 0 ? 'critical' : mine.length || pending.length ? 'caution' : 'nominal'
  return { key, findingCount: mine.length, highCount: high, pendingCount: pending.length, overdue }
}

function Led({ color, pulse, size = 'size-2.5' }) {
  return (
    <span
      className={`${size} shrink-0 rounded-full ${pulse ? 'animate-led' : ''}`}
      style={{ background: color, boxShadow: `0 0 9px 1.5px ${color}99` }}
    />
  )
}

function MachineTile({ machine, findings, approvals }) {
  const { t, tDue } = useI18n()
  const Icon = iconForMachine(`${machine.name} ${machine.code}`)
  const s = deriveStatus(machine.name, machine.dueTone, findings, approvals)
  const tone = STATUS[s.key]

  const detail = s.findingCount
    ? `${s.findingCount} ${t(s.findingCount === 1 ? 'plant.openFinding' : 'plant.openFindings')}` +
      (s.pendingCount ? ` · ${s.pendingCount} ${t(s.pendingCount === 1 ? 'plant.part' : 'plant.parts')}` : '')
    : s.pendingCount
      ? `${s.pendingCount} ${t('plant.pendingParts')}`
      : t('plant.noFindings')

  return (
    <div className="blueprint-grid relative overflow-hidden rounded-xl border border-steel-800 bg-steel-900 p-4 transition-colors hover:border-primary/60">
      <div className="flex items-start justify-between gap-2">
        <Icon size={38} className="text-primary-200" title={machine.name} />
        <div className="flex items-center gap-1.5 pt-0.5">
          <span className="readout text-[9px] font-semibold uppercase tracking-[0.16em] text-white/75">
            {t(tone.key)}
          </span>
          <Led color={tone.color} pulse={tone.pulse} />
        </div>
      </div>

      <p className="mt-3 truncate text-sm font-semibold text-white">{machine.name}</p>
      <p className="readout mt-0.5 truncate text-[11px] text-primary-200">
        {machine.code} · {machine.area}
      </p>

      <div className="mt-3 space-y-1 border-t border-white/10 pt-2.5">
        <p
          className={`readout truncate text-[11px] ${
            s.overdue ? 'font-semibold text-signal-red-soft' : 'text-white/75'
          }`}
        >
          {tDue(machine.due, machine.dueLabel)}
        </p>
        <p className={`truncate text-[11px] ${s.findingCount ? 'text-white/85' : 'text-white/60'}`}>
          {detail}
        </p>
      </div>

      {/* Status bar along the bottom edge — reads at a glance from across a room. */}
      <div className="absolute inset-x-0 bottom-0 h-[3px]" style={{ background: tone.color }} />
    </div>
  )
}

export default function PlantMap({ machines = [], findings = [], approvals = [] }) {
  const { t } = useI18n()
  return (
    <section className="mb-4">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="readout text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-soft">
          {t('dash.plantFloor')}
        </h2>
        <div className="flex items-center gap-3">
          {['nominal', 'caution', 'critical'].map((k) => (
            <span key={k} className="flex items-center gap-1.5 text-[10px] font-medium text-ink-faint">
              <Led color={STATUS[k].color} pulse={false} size="size-2" />
              {t(STATUS[k].key)}
            </span>
          ))}
        </div>
      </div>

      {machines.length === 0 ? (
        <div className="grid h-32 place-items-center rounded-xl border border-line bg-surface text-xs text-ink-faint">
          {t('dash.loadingPlant')}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {machines.map((m) => (
            <MachineTile key={m.id} machine={m} findings={findings} approvals={approvals} />
          ))}
        </div>
      )}
    </section>
  )
}
