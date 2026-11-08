/** Shared approval presentation; each caller retains its decision policy and answer channel. */
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Button, MarkdownText, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { MarkdownLabels } from '@deepseek-ai/dsh-client-ui-primitives'
import type { FactoryComponentPropsOf } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from './contract/slots.ts'
import type { ApprovalAskTurn } from './contract/slots.ts'
import css from './ApprovalPanel.module.css'
import { ApprovalWarning } from './ApprovalWarning.tsx'

/**
 * Render one decision with caller-owned actions and an optional persistent choice.
 * @param props Request identity, copy, actions and correlated detail.
 * @returns The shared approval card, reset for each request.
 */
export function ApprovalCard(props: FactoryComponentPropsOf<'conversation.approval.card'>) {
  return <ApprovalFlow key={props.requestKey} {...props} />
}

function ApprovalFlow(props: FactoryComponentPropsOf<'conversation.approval.card'>) {
  const { requestKey, title, description, subject, warning, allowLabel, canAnswer, onAllow, onReject, onAlways, ask, t } = props
  const detail = props.callId === undefined ? null : props.renderSlot('conversation.approval.detail', { callId: props.callId })
  const [answered, setAnswered] = useState(false)
  const [askOpen, setAskOpen] = useState(false)
  const [askTurns, setAskTurns] = useState<readonly ApprovalAskTurn[]>([])
  const [askDraft, setAskDraft] = useState('')
  const [askPending, setAskPending] = useState<{ question: string; answer: string } | null>(null)
  const [askFailed, setAskFailed] = useState(false)
  const waiting = useRef(false)
  const active = useRef(true)
  const composing = useRef(false)
  const compositionEnded = useRef(false)
  const askAbort = useRef<AbortController | null>(null)
  const askLog = useRef<HTMLDivElement | null>(null)
  const askInput = useRef<HTMLTextAreaElement | null>(null)
  const askPanelId = useId()
  // Stable per locale revision: a fresh label object per render would discard MarkdownText's streaming cache.
  const markdownLabels = useMemo<MarkdownLabels>(() => ({
    code: { copyLabel: t('markdown.copy'), copiedLabel: t('markdown.copied') },
    footnotes: t('markdown.footnotes'),
  }), [t])
  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
      askAbort.current?.abort()
    }
  }, [])
  useEffect(() => {
    if (askOpen) askInput.current?.focus()
  }, [askOpen])
  useEffect(() => {
    const log = askLog.current
    if (log === null) return
    log.scrollTop = log.scrollHeight
  }, [askOpen, askTurns, askPending, askFailed])
  const stopAsk = (): void => {
    askAbort.current?.abort()
    askAbort.current = null
    setAskPending(null)
    setAskFailed(false)
  }
  const toggleAsk = (): void => {
    if (askOpen) stopAsk()
    setAskOpen(!askOpen)
  }
  const sendAsk = (): void => {
    if (ask === undefined || askPending !== null || answered) return
    const question = askDraft.trim()
    if (question === '') return
    const controller = new AbortController()
    askAbort.current = controller
    const history = askTurns
    setAskDraft('')
    setAskFailed(false)
    setAskPending({ question, answer: '' })
    void (async () => {
      let answer = ''
      try {
        for await (const delta of ask.ask({ question, history }, controller.signal)) {
          if (!active.current || controller.signal.aborted) return
          answer += delta
          setAskPending({ question, answer })
        }
        if (!active.current || controller.signal.aborted) return
        setAskTurns(current => [...current, { role: 'user', text: question }, { role: 'assistant', text: answer }])
        setAskPending(null)
      } catch {
        // Cancellation is handled by the abort path; only a live stream failure is reported.
        if (!active.current || controller.signal.aborted) return
        setAskPending(null)
        setAskFailed(true)
        setAskDraft(question)
      } finally {
        if (askAbort.current === controller) askAbort.current = null
      }
    })()
  }
  const askKeydown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key !== 'Enter' || event.defaultPrevented) return
    if (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return
    // oxlint-disable-next-line typescript/no-deprecated -- IME 229 covers engines without isComposing.
    if (event.repeat || composing.current || compositionEnded.current || event.nativeEvent.isComposing || event.keyCode === 229) return
    event.preventDefault()
    sendAsk()
  }
  const answer = (send: () => Promise<void>): void => {
    if (waiting.current || !canAnswer()) return
    stopAsk()
    setAskOpen(false)
    waiting.current = true
    setAnswered(true)
    void send().catch(() => {
      if (!active.current || !canAnswer()) return
      waiting.current = false
      setAnswered(false)
    })
  }
  const keydown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const element = event.target as Element
    if (event.defaultPrevented || !event.currentTarget.contains(document.activeElement)
      || element.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]') !== null) return
    if (event.key !== 'Enter' && event.key !== 'Escape') return
    if (event.key === 'Enter' && element.closest('button, a[href], [role="button"]') !== null) return
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return
    event.preventDefault()
    event.stopPropagation()
    // oxlint-disable-next-line typescript/no-deprecated -- IME 229 covers engines without isComposing.
    if (event.repeat || composing.current || compositionEnded.current || event.nativeEvent.isComposing || event.keyCode === 229) return
    answer(event.key === 'Enter' ? onAllow : onReject)
  }
  return (
    <div className={css.root} data-approval-key={requestKey} aria-busy={answered}
      onKeyDown={keydown}
      onKeyUpCapture={() => { compositionEnded.current = false }}
      onCompositionStartCapture={() => { composing.current = true }}
      onCompositionEndCapture={() => { composing.current = false; compositionEnded.current = true }}>
      <div className={subject === undefined ? css.card : `${css.card} ${css.withSubject}`}>
        <div className={css.strip}><StateDot state={answered ? 'ongoing' : 'warning'} />{t('waiting')}</div>
        <div
          className={css.body}
          data-approval-scroll=""
          tabIndex={0}
          role="group"
          aria-label={t('detail.aria')}
        >
          {subject !== undefined && <div className={css.subject}>
            {subject.icon !== undefined && <img src={subject.icon} alt="" width={40} height={40} draggable={false} />}
            <strong>{subject.name}</strong>
          </div>}
          <div className={css.heading}>
            <div className={css.headline}>{title}</div>
            {warning !== undefined && <ApprovalWarning warning={warning} />}
          </div>
          {description !== undefined && <p className={css.description}>{description}</p>}
          {detail !== null && <div className={css.command}>{detail}</div>}
        </div>
        {ask !== undefined && askOpen && <div className={css.ask} id={askPanelId}>
          <div className={css.askLog} ref={askLog} role="log" aria-label={t('ask.log.aria')}>
            {askTurns.map((turn, index) => <div
              key={index}
              className={turn.role === 'user' ? css.askQuestion : css.askAnswer}
            >
              {turn.role === 'user'
                ? <p className={css.askQuestionText}>{turn.text}</p>
                : <MarkdownText text={turn.text} labels={markdownLabels} variant="compact" />}
            </div>)}
            {askPending !== null && <>
              <div className={css.askQuestion}>
                <p className={css.askQuestionText}>{askPending.question}</p>
              </div>
              <div className={css.askAnswer}>
                {askPending.answer === ''
                  ? <span className={css.askThinking}><StateDot state="ongoing" />{t('ask.thinking')}</span>
                  : <MarkdownText text={askPending.answer} streaming labels={markdownLabels} variant="compact" />}
              </div>
            </>}
            {askFailed && <p className={css.askError} role="alert">{t('ask.failed')}</p>}
          </div>
          <div className={css.askInputRow}>
            <textarea
              ref={askInput}
              className={css.askInput}
              rows={1}
              value={askDraft}
              placeholder={t('ask.placeholder')}
              aria-label={t('ask.placeholder')}
              disabled={answered}
              onChange={(event) => { setAskDraft(event.target.value) }}
              onKeyDown={askKeydown}
            />
            <Button
              size="sm"
              variant="outline"
              disabled={answered || askPending !== null || askDraft.trim() === ''}
              onClick={sendAsk}
            >
              {t('ask.send')}
            </Button>
          </div>
        </div>}
        <div className={css.actionRow}>
          <Button variant="outline" className={css.reject} disabled={answered} onClick={() => { answer(onReject) }}>
            {t('reject')}
          </Button>
          {ask !== undefined && <Button
            variant="outline"
            disabled={answered}
            aria-expanded={askOpen}
            aria-controls={askPanelId}
            onClick={toggleAsk}
          >
            {askOpen ? t('ask.close') : t('ask')}
          </Button>}
          <Button variant={onAlways === undefined ? 'primary' : 'outline'} disabled={answered} onClick={() => { answer(onAllow) }}>
            {allowLabel ?? t('allowOnce')}
          </Button>
          {onAlways !== undefined && <Button variant="primary" disabled={answered} onClick={() => { answer(onAlways) }}>
            {t('allowAlways')}
          </Button>}
        </div>
      </div>
    </div>
  )
}
