---
description: "Browser approval UI that answers Host permission requests through the scoped interaction path."
kind: "package-reference"
---
# @deepseek-ai/dsh-client-ui-approval

English | [中文](README.zh.md)

## Summary

Browser approval presentation over the Agent-scoped Remote Event waterfall. The plugin publishes each pending request through `ctx.uiSession`, takes over the Conversation composer, optionally renders correlated Tool detail, and returns the user's decision to the waiting Host request. Use it when a browser must collect approval for a waiting Host operation.

## Table of Contents

- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

Focus the approval detail region to approve with Enter or reject with Escape. The mounted plugin reserves both keys against editable shortcuts. Enter on the focused Reject button retains its native reject action. Input controls and IME candidates keep their own keys. Keyboard and pointer actions share one pending-request lock; a withdrawn or replaced request cannot accept another answer, and an earlier failed answer cannot unlock its replacement.

When offered, **Always allow** is the highlighted primary button. Otherwise, the current-request allow action is primary. Enter in the detail region always grants the limited scope: once for a tool approval, or the current session for CUA. Persistent access requires explicitly activating Always allow. The shortcut reference uses Allow because the caller supplies that scope.

When a caller supplies the optional side-conversation channel, the card adds an **Ask** action beside the decisions. It opens an inline chatbox for the pending request: each question goes to the Session's current provider/model through the caller's channel, streamed answer deltas appear in the card, and Reject/Allow stay available while an answer streams. The exchange is ephemeral UI assistance — the caller's channel owns the transport, neither the question nor the answer enters the Session conversation or approval audit, and answering the request aborts a pending answer.

Callers can supply localized warning copy through the shared card's optional `warning` field, with paragraphs separated by blank lines (`\n\n`). Hovering or keyboard-focusing the tag opens a formatted nonmodal card; clicking or tapping also opens it. The pointer can cross into the card to read or select its text. Leaving both surfaces closes it after a short grace period unless keyboard focus remains inside. Moving focus outside, clicking outside, and Escape also dismiss it without rejecting the request. Hover does not move focus. Moving focus elsewhere also closes a hover-open card, including when a foreground modal takes focus. Switching away from the window or hiding the browser tab closes it without restoring focus. Foreground modals and input-method composition retain their keyboard handling. CSS anchors position the card above the tag with window-edge fallbacks and internal scrolling when space is limited.

<a id="model-experience"></a>
## Model Experience

### Approval side question

#### What the model sees

A caller that supplies the optional side-conversation channel sends one auxiliary request per asked question through the Host's `session.askApproval` method and the Session's current provider/model: a fixed instruction, the pending call's name and JSON arguments, the approval reason, the earlier exchanges of that side conversation, and the question. The streamed answer returns to the card only; it is never persisted, never added to the Session surface, and never sent to the main conversation. Without that channel the package registers nothing model-facing.

#### Token effect

One additional model request per asked question, with no caching, retries, or compaction. The exchange does not change any other request.

#### KV Cache effect

No effect on the Session's conversation; each side question is an independent auxiliary request outside the conversation's cached prefix.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- The shared `conversation.approval.card` Factory presents reject, allow and an optional always-allow action, with caller-owned scope, subject metadata and answer callbacks. Tool approvals offer those decisions plus the side-question action when the caller supplies a channel; application consent can reuse the card without adopting tool-approval policy. Subject metadata enables left-aligned content and wrapping actions; callers that omit it retain inherited alignment and a single action row. Icons and labels identify the subject visually; the caller owns identity verification and saved grants.
- The side conversation is card-local memory: closing the request, switching Sessions, or reloading discards it because no question or answer is persisted. A caller that renders the card without a channel, such as CUA application consent, shows only the decision actions.


<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
