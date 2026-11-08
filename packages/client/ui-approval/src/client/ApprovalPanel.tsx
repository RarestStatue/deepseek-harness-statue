/** Composer adapter for one pending tool-approval waterfall. */
import type { ApprovalAskChannel, ApprovalComposerProps } from './contract/slots.ts'

/**
 * Render the shared card using the tool approval's one-shot decision policy.
 * @param props Selector-matched request and standard Slot props.
 * @returns The approval composer takeover.
 */
export function ApprovalPanel(props: ApprovalComposerProps) {
  const approval = props.matched
  const reason = approval.displayReason === undefined ? approval.reason : props.resolveReason(approval.displayReason)
  const ask: ApprovalAskChannel = {
    ask: (input, signal) => props.askApproval({
      sessionId: approval.sessionId,
      toolName: approval.toolName,
      ...(approval.toolArguments === undefined ? {} : { toolArguments: approval.toolArguments }),
      ...(approval.reason === undefined ? {} : { reason: approval.reason }),
      question: input.question,
      history: input.history,
    }, signal),
  }
  return props.renderFactorySlot('conversation.approval.card', {
    requestKey: approval.key,
    title: reason ?? props.t('escalation', { toolName: approval.toolName }),
    ...(approval.callId === undefined ? {} : { callId: approval.callId }),
    canAnswer: () => approval.answerable,
    onAllow: () => approval.answer('allowed-once'),
    onReject: () => approval.answer('rejected'),
    ask,
  })
}
