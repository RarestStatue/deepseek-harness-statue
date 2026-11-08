/** `approval` namespace dictionaries. */

/** Simplified Chinese dictionary and key-set source of truth. */
export const zh = {
  waiting: '等待审批',
  'detail.aria': '审批详情',
  escalation: '工具 {toolName} 请求越权执行',
  reject: '拒绝',
  allow: '允许',
  allowOnce: '允许一次',
  allowAlways: '始终允许',
  ask: '询问',
  'ask.placeholder': '询问此操作…',
  'ask.send': '发送',
  'ask.thinking': '思考中…',
  'ask.failed': '无法获得回答，请重试。',
  'ask.log.aria': '审批提问记录',
  'ask.close': '关闭',
  'markdown.copy': '复制',
  'markdown.copied': '已复制',
  'markdown.footnotes': '脚注',
} satisfies Record<string, string>

/** Approval dictionary key union. */
export type ApprovalKey = keyof typeof zh

/** English dictionary, checked against the Chinese key set. */
export const en = {
  waiting: 'Waiting for approval',
  'detail.aria': 'Approval details',
  escalation: 'Tool {toolName} requests privileged execution',
  reject: 'Reject',
  allow: 'Allow',
  allowOnce: 'Allow once',
  allowAlways: 'Always allow',
  ask: 'Ask',
  'ask.placeholder': 'Ask about this action',
  'ask.send': 'Send',
  'ask.thinking': 'Thinking…',
  'ask.failed': 'Could not get an answer. Try again.',
  'ask.log.aria': 'Approval question log',
  'ask.close': 'Close',
  'markdown.copy': 'Copy',
  'markdown.copied': 'Copied',
  'markdown.footnotes': 'Footnotes',
} satisfies Record<ApprovalKey, string>

/** Japanese copy, checked against the English keys. */
export const ja = {
  'waiting': '承認待ち',
  'detail.aria': '承認の詳細',
  'escalation': 'ツール {toolName} が特権実行を要求しています',
  'reject': '拒否',
  'allow': '許可',
  'allowOnce': '1 回だけ許可',
  'allowAlways': '常に許可',
  'ask': '質問',
  'ask.placeholder': 'この操作について質問する',
  'ask.send': '送信',
  'ask.thinking': '考え中…',
  'ask.failed': '回答を取得できませんでした。もう一度お試しください。',
  'ask.log.aria': '承認の質問履歴',
  'ask.close': '閉じる',
  'markdown.copy': 'コピー',
  'markdown.copied': 'コピーしました',
  'markdown.footnotes': '脚注',
} satisfies Record<keyof typeof en, string>

/** Spanish dictionary, checked against the English keys. */
export const es = {
  waiting: 'Esperando aprobación',
  'detail.aria': 'Detalles de aprobación',
  escalation: 'La herramienta {toolName} solicita ejecución privilegiada',
  reject: 'Rechazar',
  allow: 'Permitir',
  allowOnce: 'permitir una vez',
  allowAlways: 'Permitir siempre',
  ask: 'Preguntar',
  'ask.placeholder': 'Pregunta sobre esta acción',
  'ask.send': 'Enviar',
  'ask.thinking': 'Pensando…',
  'ask.failed': 'No se pudo obtener una respuesta. Inténtalo de nuevo.',
  'ask.log.aria': 'Registro de preguntas de aprobación',
  'ask.close': 'Cerrar',
  'markdown.copy': 'Copiar',
  'markdown.copied': 'Copiado',
  'markdown.footnotes': 'Notas al pie',
} satisfies Record<keyof typeof en, string>

/** French dictionary, checked against the English keys. */
export const fr = {
  waiting: "En attente d'approbation",
  'detail.aria': "Détails de l'approbation",
  escalation: "L'outil {toolName} demande une exécution privilégiée",
  reject: 'Rejeter',
  allow: 'Autoriser',
  allowOnce: 'Autoriser une fois',
  allowAlways: 'Toujours autoriser',
  ask: 'Demander',
  'ask.placeholder': 'Poser une question sur cette action',
  'ask.send': 'Envoyer',
  'ask.thinking': 'Réflexion…',
  'ask.failed': "Impossible d'obtenir une réponse. Réessayez.",
  'ask.log.aria': "Journal des questions d'approbation",
  'ask.close': 'Fermer',
  'markdown.copy': 'Copier',
  'markdown.copied': 'Copié',
  'markdown.footnotes': 'Notes de bas de page',
} satisfies Record<keyof typeof en, string>

/** German dictionary, checked against the English keys. */
export const de = {
  waiting: 'Warten auf Genehmigung',
  'detail.aria': 'Einzelheiten zur Genehmigung',
  escalation: 'Tool {toolName} fordert privilegierte Ausführung an',
  reject: 'Ablehnen',
  allow: 'Erlauben',
  allowOnce: 'Einmal zulassen',
  allowAlways: 'Immer zulassen',
  ask: 'Fragen',
  'ask.placeholder': 'Zu dieser Aktion fragen',
  'ask.send': 'Senden',
  'ask.thinking': 'Denkt nach…',
  'ask.failed': 'Keine Antwort erhalten. Bitte erneut versuchen.',
  'ask.log.aria': 'Fragenprotokoll zur Genehmigung',
  'ask.close': 'Schließen',
  'markdown.copy': 'Kopieren',
  'markdown.copied': 'Kopiert',
  'markdown.footnotes': 'Fußnoten',
} satisfies Record<keyof typeof en, string>

/** Russian dictionary, checked against the English keys. */
export const ru = {
  waiting: 'Ожидание одобрения',
  'detail.aria': 'Детали утверждения',
  escalation: 'Инструмент {toolName} запрашивает привилегированное выполнение',
  reject: 'Отклонить',
  allow: 'Разрешить',
  allowOnce: 'Разрешить один раз',
  allowAlways: 'Всегда разрешать',
  ask: 'Спросить',
  'ask.placeholder': 'Спросить об этом действии',
  'ask.send': 'Отправить',
  'ask.thinking': 'Размышление…',
  'ask.failed': 'Не удалось получить ответ. Попробуйте ещё раз.',
  'ask.log.aria': 'Журнал вопросов об утверждении',
  'ask.close': 'Закрыть',
  'markdown.copy': 'Копировать',
  'markdown.copied': 'Скопировано',
  'markdown.footnotes': 'Сноски',
} satisfies Record<keyof typeof en, string>

/** Portuguese dictionary, checked against the English keys. */
export const pt = {
  waiting: 'Aguardando aprovação',
  'detail.aria': 'Detalhes de aprovação',
  escalation: 'A ferramenta {toolName} solicita execução privilegiada',
  reject: 'Rejeitar',
  allow: 'Permitir',
  allowOnce: 'Permitir uma vez',
  allowAlways: 'Sempre permitir',
  ask: 'Perguntar',
  'ask.placeholder': 'Perguntar sobre esta ação',
  'ask.send': 'Enviar',
  'ask.thinking': 'Pensando…',
  'ask.failed': 'Não foi possível obter uma resposta. Tente novamente.',
  'ask.log.aria': 'Registro de perguntas de aprovação',
  'ask.close': 'Fechar',
  'markdown.copy': 'Copiar',
  'markdown.copied': 'Copiado',
  'markdown.footnotes': 'Notas de rodapé',
} satisfies Record<keyof typeof en, string>
