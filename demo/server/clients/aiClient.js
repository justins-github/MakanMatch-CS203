// The engine's one door to Claude. Everything that asks the AI something goes
// through json(): one call, a hard timeout, and a structured (JSON schema) answer.
// It never throws - no key, an error, a refusal, a timeout or an unreadable answer
// all come back as null, and the caller falls back to its non-AI path. The review
// reader (CSD-53) uses it today; explanations and summaries (CSD-49/52/56) later.
import Anthropic from '@anthropic-ai/sdk'

const DEFAULT_TIMEOUT_MS = 10000

export function createAiClient({ apiKey, model = 'claude-haiku-5-5', timeoutMs: requestedMs, client } = {}) {
  // A blank or mistyped AI_TIMEOUT_MS would otherwise mean "give up at once".
  const timeoutMs = Number.isFinite(requestedMs) && requestedMs > 0 ? requestedMs : DEFAULT_TIMEOUT_MS
  const available = Boolean(apiKey)
  const anthropic = available ? client ?? new Anthropic({ apiKey, maxRetries: 0, timeout: timeoutMs }) : null

  async function ask({ system, prompt, schema, maxTokens }) {
    const response = await anthropic.messages.create(
      {
        model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: prompt }],
        output_config: { effort: 'low', format: { type: 'json_schema', schema } },
      },
      { timeout: timeoutMs },
    )
    if (response.stop_reason !== 'end_turn') return null
    const text = response.content.find((block) => block.type === 'text')?.text
    return text ? JSON.parse(text) : null
  }

  return {
    available,
    model,
    async json({ system, prompt, schema, maxTokens = 1024 }) {
      if (!available) return null
      let timer
      const timedOut = new Promise((resolve) => {
        timer = setTimeout(() => resolve(null), timeoutMs)
      })
      try {
        return await Promise.race([ask({ system, prompt, schema, maxTokens }), timedOut])
      } catch {
        return null
      } finally {
        clearTimeout(timer)
      }
    },
  }
}
