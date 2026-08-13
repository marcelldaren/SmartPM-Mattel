import { callAiService } from './client.js'
import { searchRecords } from './search.js'
import { getRecurringStats } from '../db/repo/findings.js'
import { getMachineStatus } from '../db/repo/machines.js'
import { listPartRequests } from '../db/repo/partRequests.js'
import { listPullRequests, listWarehouseParts } from '../db/repo/warehouse.js'
import { getChatProvider } from '../db/repo/settings.js'

/**
 * Conversational assistant — a genuine tool-calling agent, but Node runs the loop and
 * executes every tool against its own database. Python is only the reasoning step: given
 * the running message history and the tool catalog, it decides the next tool call or the
 * final answer. That keeps all data access (and its correctness) in Node while still
 * giving the model autonomous, multi-step tool use. Works on any provider whose
 * OpenAI-compatible endpoint supports tool-calling (Gemini reliably; the local 3B model
 * best-effort, with a deterministic RAG fallback below).
 */

// OpenAI-style function-calling schemas passed through to the model.
const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'search_records',
      description:
        'Semantic search across all submitted PM checksheets/findings. Use for questions about past issues, symptoms, or history. Returns a summary and matching records.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string', description: 'Natural-language search query' } },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_recurring_issues',
      description:
        'List inspection points that have failed 2+ times on the same machine (recurrence counts, last seen, PM interval). Use for "what keeps breaking / recurring problems / predictive maintenance" questions.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_machine_status',
      description:
        'Health snapshot for one machine by name or code (e.g. "CNC Mill #3" or "MC-001"): PM due, open findings, pending part requests, recent findings.',
      parameters: {
        type: 'object',
        properties: { machine: { type: 'string', description: 'Machine name or code' } },
        required: ['machine'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_pending_part_requests',
      description:
        'List VENDOR part requests awaiting supervisor approval (part, machine, vendor, cost). These are parts that had to be ordered because they were NOT in the warehouse. This does NOT cover parts already in stock — for those use list_pending_pickups. Use for procurement, purchasing, and approval-queue questions.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'check_part_stock',
      description:
        'Check the warehouse spare-parts inventory: quantity on hand, bin location, and whether a part is in stock, low, or out. Use for "do we have X", "what is low on stock", "what is out of stock", "which bin is X in", or any question about spare parts, inventory, stock levels or the storeroom. All filters are optional — call with no arguments to get the whole inventory with a summary.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Free text matched against part name, SKU or bin location' },
          machine: { type: 'string', description: 'Machine name or code, e.g. "Conveyor Line 7" or "MC-317"' },
          category: {
            type: 'string',
            description:
              'Finding category the part serves. One of: Damaged part, Needs replacement, Needs lubrication, Misaligned, Leak detected, Abnormal noise / vibration',
          },
          level: {
            type: 'string',
            enum: ['healthy', 'low', 'out'],
            description: 'Filter by stock level: healthy (in stock), low (at or below reorder point), out (zero)',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_pending_pickups',
      description:
        'List internal pull requests — parts that WERE in stock and are waiting to be collected from a warehouse bin. No vendor, no cost, no approval needed; the only outstanding step is someone physically fetching them. Use for "what is waiting to be picked up", "what do I need to collect", or to complete the picture alongside list_pending_part_requests.',
      parameters: { type: 'object', properties: {} },
    },
  },
]

const SYSTEM = `You are SmartPM's maintenance assistant for PT Mattel Indonesia (PTMI). Answer questions about preventive-maintenance records using the tools provided — never invent data. Cite concrete sheet IDs (e.g. CS-2044) and machine names from tool results. If the tools return nothing relevant, say so plainly. Be concise and practical, like a shift supervisor. Do not use markdown tables or HTML.

Outstanding parts live in two separate places and a complete answer usually needs both: list_pending_part_requests covers parts ordered from a vendor, list_pending_pickups covers parts already in stock and waiting to be collected. When asked whether a part is available, check the warehouse with check_part_stock before discussing vendors or purchase orders — the plant does not order what it already has on a shelf.

If the user asks about you rather than the maintenance records — e.g. "what is your job", "what tools/capabilities do you have", "what can you do", "who are you" — answer directly from this description in plain language. Do not call any tool for these questions; tools are only for looking up maintenance data.`

async function runTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'search_records': {
      const r = await searchRecords(String(args.query ?? ''))
      return { summary: r.summary, results: r.results }
    }
    case 'list_recurring_issues': {
      const stats = getRecurringStats(2)
      return stats.length
        ? stats.map((s) => ({
            machine: s.machine,
            item: s.itemLabel,
            category: s.latestCategory,
            occurrences: s.occurrences,
            pmInterval: s.pmIntervalLabel,
          }))
        : { message: 'No inspection point has failed more than once yet.' }
    }
    case 'get_machine_status':
      return getMachineStatus(String(args.machine ?? '')) ?? { error: 'No machine matched that name or code.' }
    case 'list_pending_part_requests': {
      const pending = listPartRequests().filter((p) => p.status === 'pending')
      return pending.length
        ? pending.map((p) => ({ id: p.id, part: p.part, machine: p.machine, vendor: p.vendor, cost: p.cost, note: p.note }))
        : { message: 'There are no part requests awaiting approval.' }
    }
    case 'check_part_stock': {
      // Every filter is applied here in Node, not by the model: the question "is it on the
      // shelf" resolves to a row in the database, and a plausible-sounding wrong answer is
      // worse than none. The model only phrases what this returns.
      const q = String(args.query ?? '').trim().toLowerCase()
      const machine = String(args.machine ?? '').trim().toLowerCase()
      const category = String(args.category ?? '').trim().toLowerCase()
      const level = String(args.level ?? '').trim().toLowerCase()

      const all = listWarehouseParts()
      const parts = all.filter((p) => {
        if (level && p.level !== level) return false
        if (category && p.category.toLowerCase() !== category) return false
        if (machine) {
          const hay = `${p.machineName ?? ''} ${p.machineCode ?? ''}`.toLowerCase()
          // A general consumable (no machine) is genuinely usable on the named machine.
          if (p.machineId !== null && !hay.includes(machine)) return false
        }
        if (q && !`${p.partName} ${p.sku} ${p.binLocation}`.toLowerCase().includes(q)) return false
        return true
      })

      return {
        summary: {
          matched: parts.length,
          totalTracked: all.length,
          low: all.filter((p) => p.level === 'low').length,
          out: all.filter((p) => p.level === 'out').length,
        },
        parts: parts.map((p) => ({
          sku: p.sku,
          part: p.partName,
          category: p.category,
          machine: p.machineName ?? 'Any machine',
          bin: p.binLocation,
          onHand: p.quantityOnHand,
          reserved: p.reserved,
          available: p.available,
          reorderAt: p.reorderThreshold,
          maxQuantity: p.maxQuantity,
          level: p.level,
          needsRecount: p.needsRecount,
        })),
      }
    }
    case 'list_pending_pickups': {
      const pending = listPullRequests().filter((p) => p.status === 'pending_pickup')
      return pending.length
        ? pending.map((p) => ({
            id: p.code,
            part: p.partName,
            sku: p.sku,
            bin: p.binLocation,
            quantity: p.quantity,
            machine: p.machine,
            item: p.itemLabel,
            technician: p.technician,
            sheet: p.sheet,
          }))
        : { message: 'No parts are waiting to be collected from the warehouse.' }
    }
    default:
      return { error: `Unknown tool: ${name}` }
  }
}

export interface AssistantMessage {
  role: 'user' | 'assistant'
  content: string
}

/** One executed tool call, surfaced to the UI so it can render the real data as rich cards. */
export interface AssistantToolCall {
  name: string
  args: Record<string, unknown>
  result: unknown
}

export interface AssistantResult {
  answer: string
  toolsUsed: string[]
  toolCalls: AssistantToolCall[]
}

// OpenAI chat message shape (loose — passed straight through to the provider).
type ChatMessage = Record<string, unknown>

const MAX_STEPS = 4

export async function askAssistant(history: AssistantMessage[]): Promise<AssistantResult> {
  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM },
    ...history.map((m) => ({ role: m.role, content: m.content })),
  ]
  const toolsUsed: string[] = []
  const toolCalls: AssistantToolCall[] = []

  for (let step = 0; step < MAX_STEPS; step++) {
    const plan = await callAiService<{
      content: string | null
      tool_calls: Array<{
        id: string
        name: string
        arguments: string
        extra_content?: unknown
      }> | null
    }>('/assistant/plan', { provider: getChatProvider(), messages, tools: TOOLS })

    if (!plan) {
      return {
        answer: "I couldn't reach the AI service just now. Please make sure it's running and try again.",
        toolsUsed,
        toolCalls,
      }
    }

    if (plan.tool_calls && plan.tool_calls.length > 0) {
      messages.push({
        role: 'assistant',
        content: plan.content ?? '',
        // extra_content carries Gemini 3.x's thought_signature, which the provider requires
        // back verbatim on the next turn — dropping it fails the follow-up with a 400.
        tool_calls: plan.tool_calls.map((tc) => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: tc.arguments },
          ...(tc.extra_content ? { extra_content: tc.extra_content } : {}),
        })),
      })
      for (const tc of plan.tool_calls) {
        toolsUsed.push(tc.name)
        let args: Record<string, unknown> = {}
        try {
          args = tc.arguments ? JSON.parse(tc.arguments) : {}
        } catch {
          args = {}
        }
        const result = await runTool(tc.name, args)
        // Keep the structured result for the UI — the model gets a string, the client gets
        // the real objects so it can render them as cards instead of re-parsing prose.
        toolCalls.push({ name: tc.name, args, result })
        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: JSON.stringify(result).slice(0, 6000),
        })
      }
      continue // feed tool results back to the model
    }

    if (plan.content && plan.content.trim()) {
      return { answer: plan.content.trim(), toolsUsed, toolCalls }
    }
    break // no content, no tools — bail to the fallback
  }

  // Deterministic fallback: a plain RAG search over the last user turn, so the assistant
  // still returns something useful when the model won't tool-call (common on the 3B model).
  const lastUser = [...history].reverse().find((m) => m.role === 'user')?.content ?? ''
  const r = await searchRecords(lastUser)
  if (toolCalls.length === 0) {
    toolCalls.push({ name: 'search_records', args: { query: lastUser }, result: r })
  }
  const lines = r.results.slice(0, 5).map((x) => `• ${x.sheet} — ${x.finding} (${x.machine})`).join('\n')
  const answer = `${r.summary}${lines ? `\n\n${lines}` : ''}`.trim()
  return {
    answer: answer || "I couldn't find anything relevant in the maintenance records for that.",
    toolsUsed: toolsUsed.length ? toolsUsed : ['search_records'],
    toolCalls,
  }
}
