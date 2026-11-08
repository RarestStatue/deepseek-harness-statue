/**
 * Approval side-question behavior: the fixed instruction, bounded pending-call
 * context, Session route resolution, streaming deltas, failure codes,
 * cancellation, and the Remote entry point.
 */

import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { mountAgentLoopTestDependencies, mountAgentLoopTestHarness } from '@deepseek-ai/dsh-agent-loop-testkit'
import { LlmAdapter } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, RequestMessage, StreamChunk } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  APPROVAL_QUESTION_HISTORY_TOTAL_MAX_CHARS,
  APPROVAL_QUESTION_HISTORY_TURN_MAX_CHARS,
  APPROVAL_QUESTION_MAX_PAYLOAD_CHARS,
  APPROVAL_QUESTION_SYSTEM_PROMPT,
  buildApprovalQuestionMessages,
  streamApprovalQuestion,
} from '../src/approval-question.ts'
import type SessionController from '../src/index.ts'
import type { SessionApprovalQuestionRequest, SessionApprovalQuestionTurn } from '../src/types.ts'
import {
  SESSION_APPROVAL_QUESTION_MAX_CHARS,
  SESSION_APPROVAL_QUESTION_MAX_HISTORY,
  SESSION_APPROVAL_QUESTION_MAX_TOKENS,
} from '../src/types.ts'
import { createSessionTestController } from './test-remote.ts'

/** One adapter that records the exact request it receives and replays its script. */
class RecordingAdapter extends LlmAdapter {
  readonly requests: GenerateOptions[] = []

  constructor(
    private readonly script: readonly StreamChunk[] | ((options: GenerateOptions) => AsyncIterable<StreamChunk>),
  ) {
    super()
  }

  override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options)
    if (typeof this.script === 'function') {
      yield * this.script(options)
      return
    }
    yield * this.script
  }
}

const ownedContexts = new Set<Context>()
afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all([...ownedContexts].map(ctx => ctx.fiber.dispose()))
  ownedContexts.clear()
})

/** Static text answer ending in the requested terminal reason. */
function textChunks(...texts: readonly string[]): StreamChunk[] {
  return [
    { type: 'text-delta', index: 0, text: texts.join('') },
    { type: 'finish', reason: { kind: 'stop' } },
  ]
}

/** A valid request about one pending call, with overrides. */
function request(overrides: Partial<SessionApprovalQuestionRequest> = {}): SessionApprovalQuestionRequest {
  return {
    sessionId: SessionId('approval-question'),
    toolName: 'bash',
    toolArguments: { command: 'git push --force origin main' },
    reason: 'force push needs confirmation',
    question: 'What will this do to the remote branch?',
    history: [],
    ...overrides,
  }
}

/** One history turn whose text carries its index and an exact code-point length. */
function historyTurn(index: number, length: number): SessionApprovalQuestionTurn {
  const prefix = `${String(index).padStart(2, '0')}:`
  return { role: 'user', text: prefix + 'x'.repeat(length - prefix.length) }
}

/** Consume one text-delta stream into its ordered deltas. */
async function collect(stream: AsyncIterable<string>): Promise<string[]> {
  const deltas: string[] = []
  for await (const delta of stream) deltas.push(delta)
  return deltas
}

/** Run one action that must reject with a RemoteError, returning that failure. */
async function remoteFailureOf(action: () => Promise<unknown>): Promise<RemoteError> {
  try {
    await action()
  } catch (error) {
    if (error instanceof RemoteError) return error
    throw error
  }
  throw new Error('expected the operation to fail with a RemoteError')
}

/** Read the text of one expected text-only request message. */
function messageText(message: RequestMessage | undefined): string {
  if (message === undefined) throw new Error('expected a request message')
  const block = message.content[0]
  if (block?.type !== 'text') throw new Error('expected a text content block')
  return block.text
}

/** Mount an Agent whose Session records one complete request route. */
async function streamHarness(
  script: readonly StreamChunk[] | ((options: GenerateOptions) => AsyncIterable<StreamChunk>),
  route: { readonly provider: string; readonly model: string } | null = { provider: 'ask', model: 'ask-model' },
): Promise<{ readonly ctx: Context; readonly agent: Agent; readonly adapter: RecordingAdapter }> {
  const ctx = new Context()
  ownedContexts.add(ctx)
  await mountAgentLoopTestDependencies(ctx)
  const loop = await mountAgentLoopTestHarness(ctx)
  const agent = await loop.create(SessionId('approval-question'))
  if (route !== null) {
    agent.session.append('request/header', { header: { config: route }, reason: 'initial' })
  }
  const adapter = new RecordingAdapter(script)
  ctx.llm.registerAdapter(['ask'], adapter)
  return { ctx, agent, adapter }
}

describe('buildApprovalQuestionMessages', () => {
  it('serializes the pending call, trims exchange text, and orders the exchanges oldest first', () => {
    const messages = buildApprovalQuestionMessages(request({
      history: [
        { role: 'user', text: '  What does this push do?  ' },
        { role: 'assistant', text: 'It overwrites the remote branch.' },
      ],
    }))

    expect(messages.map(message => message.role)).toEqual(['user', 'user', 'assistant', 'user'])
    const context: unknown = JSON.parse(messageText(messages[0]))
    expect(context).toEqual({
      tool: { name: 'bash', arguments: { command: 'git push --force origin main' } },
      approvalReason: 'force push needs confirmation',
    })
    expect(messageText(messages[1])).toBe('What does this push do?')
    expect(messageText(messages[2])).toBe('It overwrites the remote branch.')
    expect(messageText(messages[3])).toBe('What will this do to the remote branch?')
    // The forwarded plain user input carries no durable Session identity.
    expect(messages[0]?.id).toBeUndefined()
    expect(messages[1]?.role).toBe('user')
  })

  it('omits absent arguments and approval reason from the pending-call context', () => {
    const messages = buildApprovalQuestionMessages({
      sessionId: SessionId('approval-question'),
      toolName: 'bash',
      question: 'What is pending?',
      history: [],
    })

    const context: unknown = JSON.parse(messageText(messages[0]))
    expect(context).toEqual({ tool: { name: 'bash' } })
    expect(messageText(messages.at(-1))).toBe('What is pending?')
  })

  it('forwards at most the newest history exchanges', () => {
    const history = Array.from({ length: SESSION_APPROVAL_QUESTION_MAX_HISTORY + 1 }, (_, index) => historyTurn(index, 6))
    const messages = buildApprovalQuestionMessages(request({ history }))

    expect(messages).toHaveLength(SESSION_APPROVAL_QUESTION_MAX_HISTORY + 2)
    expect(messageText(messages[1])).toBe(historyTurn(1, 6).text)
    expect(messageText(messages.at(-2))).toBe(historyTurn(SESSION_APPROVAL_QUESTION_MAX_HISTORY, 6).text)
  })

  it('bounds per-turn and total history text, skipping blank exchanges and older turns', () => {
    const history = [
      historyTurn(0, 6),
      historyTurn(1, 6),
      ...Array.from({ length: 7 }, (_, offset) => historyTurn(offset + 2, 6)),
      historyTurn(9, 5_000),
      historyTurn(10, 1_000),
      historyTurn(11, 4_000),
      { role: 'user' as const, text: '   ' },
      historyTurn(13, 5_000),
    ]
    const messages = buildApprovalQuestionMessages(request({ history }))

    // context + four forwarded exchanges + question
    expect(messages).toHaveLength(6)
    expect(messageText(messages[1])).toBe(historyTurn(9, 5_000).text.slice(0, 3) + 'x'.repeat(3_000 - 3))
    expect(messageText(messages[1])).toHaveLength(APPROVAL_QUESTION_HISTORY_TOTAL_MAX_CHARS - 9_000)
    expect(messageText(messages[2])).toBe(historyTurn(10, 1_000).text)
    expect(messageText(messages[3])).toBe(historyTurn(11, 4_000).text)
    expect(messageText(messages[4])).toBe(historyTurn(13, 5_000).text.slice(0, APPROVAL_QUESTION_HISTORY_TURN_MAX_CHARS))
    expect(messageText(messages[5])).toBe('What will this do to the remote branch?')
  })

  it('rejects a blank question', async () => {
    const failure = await remoteFailureOf(async () => {
      buildApprovalQuestionMessages(request({ question: '  \n\t ' }))
    })
    expect(failure).toMatchObject({ code: 'gateway/bad-request' })
  })

  it('rejects a question longer than the character bound', async () => {
    const failure = await remoteFailureOf(async () => {
      buildApprovalQuestionMessages(request({ question: 'x'.repeat(SESSION_APPROVAL_QUESTION_MAX_CHARS + 1) }))
    })
    expect(failure).toMatchObject({ code: 'gateway/bad-request' })
  })

  it('rejects a payload larger than the request bound', async () => {
    const failure = await remoteFailureOf(async () => {
      buildApprovalQuestionMessages(request({
        toolArguments: { text: 'x'.repeat(APPROVAL_QUESTION_MAX_PAYLOAD_CHARS) },
      }))
    })
    expect(failure).toMatchObject({ code: 'gateway/bad-request' })
  })
})

describe('streamApprovalQuestion', () => {
  it('streams text deltas on the recorded Session route and appends no Session event', async () => {
    const script: StreamChunk[] = [
      { type: 'reasoning-delta', index: 0, text: 'internal reasoning' },
      { type: 'block-start', index: 1, blockType: 'text' },
      { type: 'text-delta', index: 1, text: 'It force-pushes ' },
      { type: 'usage', usage: { inputTokens: 3, outputTokens: 2 } },
      { type: 'text-delta', index: 1, text: 'to the remote branch.' },
      { type: 'finish', reason: { kind: 'stop' } },
    ]
    const { ctx, agent, adapter } = await streamHarness(script)
    const signal = new AbortController().signal
    const before = agent.session.snapshotEvents().length

    const deltas = await collect(streamApprovalQuestion(ctx, agent, request(), signal))

    expect(deltas).toEqual(['It force-pushes ', 'to the remote branch.'])
    expect(agent.session.snapshotEvents().length).toBe(before)
    expect(adapter.requests).toHaveLength(1)
    const options = adapter.requests[0]
    if (options === undefined) throw new Error('expected one recorded model request')
    expect(options).toMatchObject({
      provider: 'ask',
      model: 'ask-model',
      temperature: 0,
      maxTokens: SESSION_APPROVAL_QUESTION_MAX_TOKENS,
      purpose: 'approval-question',
      sessionId: agent.session.id,
      system: APPROVAL_QUESTION_SYSTEM_PROMPT,
    })
    expect(options.signal).toBe(signal)
    expect(options.messages.map(message => message.role)).toEqual(['user', 'user'])
    expect(options.messages[0]?.content).toEqual([{
      type: 'text',
      text: JSON.stringify({
        tool: { name: 'bash', arguments: { command: 'git push --force origin main' } },
        approvalReason: 'force push needs confirmation',
      }),
    }])
  })

  it('reports a provider finish error', async () => {
    const { ctx, agent } = await streamHarness([
      { type: 'text-delta', index: 0, text: 'partial' },
      { type: 'finish', reason: { kind: 'error', failure: { code: 'PROVIDER_ERROR', message: 'upstream failed' } } },
    ])

    const failure = await remoteFailureOf(async () => await collect(
      streamApprovalQuestion(ctx, agent, request(), new AbortController().signal),
    ))

    expect(failure).toMatchObject({ code: 'session/approval-question-failed' })
    expect(JSON.stringify(failure.details)).toContain('PROVIDER_ERROR')
  })

  it('reports an adapter abort the caller did not request', async () => {
    const { ctx, agent } = await streamHarness([
      { type: 'finish', reason: { kind: 'aborted', failure: { code: 'ADAPTER_ABORTED', message: 'adapter gave up' } } },
    ])

    const failure = await remoteFailureOf(async () => await collect(
      streamApprovalQuestion(ctx, agent, request(), new AbortController().signal),
    ))

    expect(failure).toMatchObject({ code: 'session/approval-question-failed' })
    expect(JSON.stringify(failure.details)).toContain('ADAPTER_ABORTED')
  })

  it('propagates caller cancellation', async () => {
    const controller = new AbortController()
    const reason = new Error('the approval card released the answer')
    const { ctx, agent } = await streamHarness(async function* (): AsyncIterable<StreamChunk> {
      yield { type: 'text-delta', index: 0, text: 'partial answer' }
      controller.abort(reason)
      yield { type: 'finish', reason: { kind: 'aborted', failure: { code: 'ABORTED', message: 'cancelled' } } }
    })

    await expect(collect(
      streamApprovalQuestion(ctx, agent, request(), controller.signal),
    )).rejects.toBe(reason)
  })

  it('reports a stream that ends without a terminal finish', async () => {
    const { ctx, agent } = await streamHarness([{ type: 'text-delta', index: 0, text: 'partial' }])

    const failure = await remoteFailureOf(async () => await collect(
      streamApprovalQuestion(ctx, agent, request(), new AbortController().signal),
    ))

    expect(failure).toMatchObject({ code: 'session/approval-question-failed' })
    expect(JSON.stringify(failure.details)).toContain('terminal finish')
  })

  it('fails before dispatch when the Session has no recorded model route', async () => {
    const { ctx, agent, adapter } = await streamHarness(textChunks('answer'), null)

    const failure = await remoteFailureOf(async () => await collect(
      streamApprovalQuestion(ctx, agent, request(), new AbortController().signal),
    ))

    expect(failure).toMatchObject({ code: 'session/approval-question-failed' })
    expect(JSON.stringify(failure.details)).toContain('route')
    expect(adapter.requests).toHaveLength(0)
  })

  it.each([
    { label: 'an empty provider', route: { provider: '', model: 'ask-model' } },
    { label: 'an empty model', route: { provider: 'ask', model: '' } },
  ])('fails before dispatch when the recorded route has $label', async ({ route }) => {
    const { ctx, agent, adapter } = await streamHarness(textChunks('answer'), route)

    const failure = await remoteFailureOf(async () => await collect(
      streamApprovalQuestion(ctx, agent, request(), new AbortController().signal),
    ))

    expect(failure).toMatchObject({ code: 'session/approval-question-failed' })
    expect(adapter.requests).toHaveLength(0)
  })
})

describe('SessionController.askApproval', () => {
  /** Mount the production Session Controller over a live Agent and adapter. */
  async function controllerHarness(): Promise<{
    readonly controller: SessionController
    readonly agent: Agent
    readonly adapter: RecordingAdapter
  }> {
    const ctx = new Context()
    ownedContexts.add(ctx)
    await mountAgentLoopTestDependencies(ctx)
    const loop = await mountAgentLoopTestHarness(ctx)
    const agent = await loop.create(SessionId('approval-question-rpc'))
    agent.session.append('request/header', {
      header: { config: { provider: 'ask', model: 'ask-model' } },
      reason: 'initial',
    })
    const adapter = new RecordingAdapter(textChunks('Allow once: it only rewrites the remote branch.'))
    ctx.llm.registerAdapter(['ask'], adapter)
    const controller = await createSessionTestController(ctx, {
      defaultModelSelection: () => ({ provider: 'ask', model: 'ask-model' }),
      cwd: '/tmp',
    })
    return { controller, agent, adapter }
  }

  it('delegates to the resolved live Agent and propagates a resolver failure', async () => {
    const { controller, agent, adapter } = await controllerHarness()
    const pending = request({ sessionId: agent.session.id })

    const failure = new RemoteError('session/not-found', 'the Session is missing', { sessionId: agent.session.id })
    const resolveAgent = vi.spyOn(controller, 'resolveAgent').mockResolvedValueOnce({ error: failure })
    const unresolved = controller.askApproval(pending, new AbortController().signal)[Symbol.asyncIterator]()
    await expect(unresolved.next()).rejects.toBe(failure)
    resolveAgent.mockRestore()

    const deltas = await collect(controller.askApproval(pending, new AbortController().signal))

    expect(deltas).toEqual(['Allow once: it only rewrites the remote branch.'])
    expect(adapter.requests).toHaveLength(1)
    expect(adapter.requests[0]).toMatchObject({
      provider: 'ask',
      model: 'ask-model',
      purpose: 'approval-question',
      sessionId: agent.session.id,
    })
  })
})
