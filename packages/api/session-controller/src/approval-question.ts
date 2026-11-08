/**
 * Approval side-question execution: one auxiliary, non-persisted model request
 * that explains a pending tool call to the human deciding it.
 *
 * @module @deepseek-ai/dsh-api-session-controller/approval-question
 */

declare module '@deepseek-ai/dsh-llm/types' {
  interface LlmRequestPurposeMap {
    'approval-question': true
  }
}

import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createAssistantMessage } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, RequestMessage } from '@deepseek-ai/dsh-llm'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import { deepFreeze } from '@deepseek-ai/dsh-util-values'
import { truncateUnicodeCodePoints } from './list.ts'
import {
  SESSION_APPROVAL_QUESTION_MAX_CHARS,
  SESSION_APPROVAL_QUESTION_MAX_HISTORY,
  SESSION_APPROVAL_QUESTION_MAX_TOKENS,
} from './types.ts'
import type { SessionApprovalQuestionRequest, SessionApprovalQuestionTurn } from './types.ts'

/**
 * Fixed system instruction for every approval side question. It frames the
 * model as an explainer, not a decider: the pending call has not run, and the
 * answer may use only the facts the request supplies.
 */
export const APPROVAL_QUESTION_SYSTEM_PROMPT = `You explain one pending tool call to a human who is deciding whether to allow it.

The pending call has NOT executed. Never say it ran, succeeded, or failed, and never claim or invent its result. Answer only from the pending call's tool name, its JSON arguments, and the approval reason supplied in the conversation. Do not assume repository, environment, account, or execution facts you cannot see, and do not ask the user for more context.

Explain what the invocation does and its concrete effects: which files, processes, network destinations, accounts, or other state it touches, which of those effects are irreversible, and which risks or side effects a careful person should check before allowing it. Name the exact targets and values the arguments show. When the arguments are insufficient for a judgement, say which fact is missing and what to verify instead of guessing.

Keep every answer under 150 words of plain prose, with no headings, lists, or tool calls. Answer the user's question directly.`

/** Most Unicode code points one forwarded side-conversation turn keeps. */
export const APPROVAL_QUESTION_HISTORY_TURN_MAX_CHARS = 4_000

/** Most Unicode code points all forwarded side-conversation turns keep together. */
export const APPROVAL_QUESTION_HISTORY_TOTAL_MAX_CHARS = 12_000

/**
 * Most Unicode code points one side question may send to the model across its
 * pending-call context, forwarded exchanges, and question. A larger request is
 * rejected instead of truncated: a partial JSON context would misdescribe the
 * pending call.
 */
export const APPROVAL_QUESTION_MAX_PAYLOAD_CHARS = 40_000

/**
 * Inert provider/model identity recorded on forwarded assistant turns. A
 * history turn carries no replay state, so no adapter or Session lookup ever
 * resolves this route; the identity only satisfies the assistant message value.
 */
const HISTORY_TURN_SOURCE = { provider: 'approval-question-history', model: 'approval-question-history' } as const

/** Count Unicode code points, the unit used by every approval-question bound. */
function codePointLength(text: string): number {
  return Array.from(text).length
}

/** Reject a request the Client should not have produced. */
function badRequest(reason: string): RemoteError<'gateway/bad-request'> {
  return new RemoteError('gateway/bad-request', reason, {})
}

/** Report a model-call failure for the approval question. */
function approvalQuestionFailure(reason: string): RemoteError<'session/approval-question-failed'> {
  return new RemoteError('session/approval-question-failed', reason, { reason })
}

/**
 * Serialize the pending-call facts the question is about. JSON keeps arbitrary
 * tool arguments lossless and separates them from the instruction text.
 */
function pendingCallContext(request: SessionApprovalQuestionRequest): string {
  return JSON.stringify({
    tool: {
      name: request.toolName,
      ...request.toolArguments === undefined ? {} : { arguments: request.toolArguments },
    },
    ...request.reason === undefined ? {} : { approvalReason: request.reason },
  })
}

/**
 * Forward the newest earlier exchanges within the history bounds, oldest first.
 * A turn keeps at most {@link APPROVAL_QUESTION_HISTORY_TURN_MAX_CHARS}; the
 * forwarded turns as a whole keep at most
 * {@link APPROVAL_QUESTION_HISTORY_TOTAL_MAX_CHARS}, so older turns are dropped
 * before a newer one is truncated. Blank turns carry no information and are
 * skipped.
 * @param history - earlier exchanges of this side conversation, oldest first.
 * @returns the forwarded turns, oldest first.
 */
function forwardedHistory(
  history: readonly SessionApprovalQuestionTurn[],
): readonly SessionApprovalQuestionTurn[] {
  const forwarded: SessionApprovalQuestionTurn[] = []
  let remaining = APPROVAL_QUESTION_HISTORY_TOTAL_MAX_CHARS
  for (const turn of history.slice(-SESSION_APPROVAL_QUESTION_MAX_HISTORY).reverse()) {
    if (remaining === 0) break
    const text = turn.text.trim()
    if (text === '') continue
    const bounded = truncateUnicodeCodePoints(
      text,
      Math.min(APPROVAL_QUESTION_HISTORY_TURN_MAX_CHARS, remaining),
    )
    forwarded.push({ role: turn.role, text: bounded })
    remaining -= codePointLength(bounded)
  }
  return forwarded.reverse()
}

/** The model route recorded by the Session's newest request header. */
function resolveRequestHeaderRoute(
  agent: Agent,
): { readonly provider: string; readonly model: string } {
  const header = agent.session.requestHeader()
  const provider = header?.config.provider
  const model = header?.config.model
  if (provider === undefined || model === undefined || provider.length === 0 || model.length === 0) {
    throw approvalQuestionFailure('the Session has no complete recorded provider/model route')
  }
  return { provider, model }
}

/**
 * Build the message list for one approval side question: the pending call as
 * JSON context, the earlier exchanges oldest first, then the question.
 * Applies the question, history, and payload bounds described by the exported
 * constants.
 * @param request - pending call identity, lossless JSON arguments, approval
 *   reason, earlier exchanges, and the user's question.
 * @returns the complete request messages, oldest first.
 * @throws {RemoteError} `gateway/bad-request` when the question is blank or
 *   oversized, or when the bounded request payload is still too large.
 */
export function buildApprovalQuestionMessages(
  request: SessionApprovalQuestionRequest,
): RequestMessage[] {
  const question = request.question.trim()
  if (question === '') throw badRequest('An approval question must contain visible text')
  const questionLength = codePointLength(question)
  if (questionLength > SESSION_APPROVAL_QUESTION_MAX_CHARS) {
    throw badRequest(`An approval question must not exceed ${String(SESSION_APPROVAL_QUESTION_MAX_CHARS)} code points`)
  }
  const context = pendingCallContext(request)
  const history = forwardedHistory(request.history)
  const historyLength = history.reduce((total, turn) => total + codePointLength(turn.text), 0)
  if (codePointLength(context) + historyLength + questionLength > APPROVAL_QUESTION_MAX_PAYLOAD_CHARS) {
    throw badRequest('The approval question payload is too large for one model request')
  }
  const messages: RequestMessage[] = [{
    role: 'user',
    content: [{ type: 'text', text: context }],
  }]
  for (const turn of history) {
    messages.push(turn.role === 'user'
      ? { role: 'user', content: [{ type: 'text', text: turn.text }] }
      : createAssistantMessage({
        content: [{ type: 'text', text: turn.text }],
        source: HISTORY_TURN_SOURCE,
      }))
  }
  messages.push({ role: 'user', content: [{ type: 'text', text: question }] })
  return messages
}

/**
 * Stream one auxiliary model answer about a pending approval request.
 *
 * The answer helps a human judge the pending call; it never enters the Session
 * log or surface. Like Auto review's reviewer call, this request is UI
 * assistance outside the conversation: it appends no Session event, adds no
 * message to the Session history, and is never an authorization input.
 * @param ctx - Host context providing the model service.
 * @param agent - Agent whose Session supplies the current model route and id.
 * @param request - pending call identity, lossless JSON arguments, approval
 *   reason, earlier exchanges, and the user's question.
 * @param signal - stream cancellation owned by the Remote stream carrier.
 * @returns text deltas of one answer, in generation order.
 * @throws {RemoteError} `gateway/bad-request` when the request violates a
 *   question or payload bound.
 * @throws {RemoteError} `session/approval-question-failed` when the Session has
 *   no recorded model route, or the model call fails or omits a terminal finish.
 */
export async function* streamApprovalQuestion(
  ctx: Context,
  agent: Agent,
  request: SessionApprovalQuestionRequest,
  signal: AbortSignal,
): AsyncIterable<string> {
  const messages = buildApprovalQuestionMessages(request)
  const route = resolveRequestHeaderRoute(agent)
  const options: GenerateOptions = deepFreeze({
    provider: route.provider,
    model: route.model,
    system: APPROVAL_QUESTION_SYSTEM_PROMPT,
    messages,
    temperature: 0,
    maxTokens: SESSION_APPROVAL_QUESTION_MAX_TOKENS,
    sessionId: agent.session.id,
    purpose: 'approval-question',
    signal,
  })
  let finished = false
  for await (const chunk of ctx.llm.stream(options)) {
    if (chunk.type === 'text-delta') {
      yield chunk.text
      continue
    }
    if (chunk.type !== 'finish') continue
    finished = true
    if (chunk.reason.kind === 'error') {
      throw approvalQuestionFailure(
        `the approval question model call failed with ${chunk.reason.failure.code}: ${chunk.reason.failure.message}`,
      )
    }
    if (chunk.reason.kind === 'aborted') {
      // A caller cancellation keeps the carrier's cancellation semantics; an
      // adapter-initiated abort without one is a failed auxiliary request.
      if (signal.aborted) throw signal.reason
      throw approvalQuestionFailure(
        `the approval question model call was aborted with ${chunk.reason.failure.code}: ${chunk.reason.failure.message}`,
      )
    }
    // `stop`, `max-tokens`, and adapter-specific terminal reasons all complete
    // the answer; the Remote stream simply ends.
  }
  if (!finished) throw approvalQuestionFailure('the approval question model call ended without a terminal finish')
}
