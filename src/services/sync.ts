import type { Comment, OutboxEntry, Paragraph, RepositorySnapshot } from '../types'

/**
 * 审阅台 ↔ 期刊稿库 对接规则：
 * - 两边先后动过同一段：已定稿的以稿库为准（拉回审阅台），未定稿的以审阅台为准（推去稿库）。
 * - 审阅台的批注与建议只做并集合并，本地已有的一律保留，不会被抹掉。
 * - 稿库已定稿段落受写保护，审阅台的改动顶不回去。
 */

export interface ParagraphDecision {
  paragraphId: string
  /** pull = 以稿库为准拉回本地；push = 以审阅台为准推去稿库；none = 两边一致 */
  action: 'pull' | 'push' | 'none'
  finalized: boolean
}

export interface SyncPlan {
  decisions: ParagraphDecision[]
  /** 需要推去稿库的段落（未定稿、以审阅台为准） */
  paragraphPushes: string[]
  /** 需要从稿库拉回的段落（已定稿、以稿库为准） */
  paragraphPulls: string[]
  /** 审阅台有、稿库还没有的意见（待推） */
  commentUploads: string[]
  /** 稿库有、审阅台还没有的意见（待拉，本地已有的一概不动） */
  commentPulls: Comment[]
}

export const planSync = (paragraphs: Paragraph[], comments: Comment[], repo: RepositorySnapshot): SyncPlan => {
  const decisions: ParagraphDecision[] = []
  for (const local of paragraphs) {
    const remote = repo.paragraphs.find((item) => item.id === local.id)
    if (!remote) {
      // 稿库还没有这一段：以审阅台为准补过去
      decisions.push({ paragraphId: local.id, action: 'push', finalized: false })
      continue
    }
    if (remote.finalized) {
      // 已定稿：以稿库为准
      const differs = remote.text !== local.text || !local.finalized
      decisions.push({ paragraphId: local.id, action: differs ? 'pull' : 'none', finalized: true })
    } else {
      // 未定稿：以审阅台为准（本地若还留着过期的定稿标记，一并清掉）
      const differs = remote.text !== local.text || local.finalized
      decisions.push({ paragraphId: local.id, action: differs ? 'push' : 'none', finalized: false })
    }
  }
  return {
    decisions,
    paragraphPushes: decisions.filter((item) => item.action === 'push').map((item) => item.paragraphId),
    paragraphPulls: decisions.filter((item) => item.action === 'pull').map((item) => item.paragraphId),
    commentUploads: comments
      .filter((comment) => !repo.comments.some((remote) => remote.id === comment.id))
      .map((comment) => comment.id),
    commentPulls: repo.comments.filter((remote) => !comments.some((comment) => comment.id === remote.id)),
  }
}

/** 应用拉取侧：只动“以稿库为准”的段落与稿库独有的意见，本地其余内容原样保留 */
export const applyPull = (
  paragraphs: Paragraph[],
  comments: Comment[],
  repo: RepositorySnapshot,
  plan: SyncPlan,
): { paragraphs: Paragraph[]; comments: Comment[]; pulledCount: number } => {
  const pullIds = new Set(plan.paragraphPulls)
  const nextParagraphs = paragraphs.map((paragraph) => {
    if (!pullIds.has(paragraph.id)) {
      // 稿库已取消定稿的段落，本地同步摘掉定稿标记
      const remote = repo.paragraphs.find((item) => item.id === paragraph.id)
      if (remote && !remote.finalized && paragraph.finalized) {
        return { ...paragraph, finalized: false, finalizedAt: undefined }
      }
      return paragraph
    }
    const remote = repo.paragraphs.find((item) => item.id === paragraph.id)
    if (!remote) return paragraph
    return {
      ...paragraph,
      text: remote.text,
      finalized: true,
      finalizedAt: remote.finalizedAt,
      status: paragraph.status === 'locked' ? paragraph.status : 'accepted' as const,
      highlighted: remote.text !== paragraph.text ? true : paragraph.highlighted,
      attribution: { side: 'repository' as const, updatedAt: remote.attribution.updatedAt },
    }
  })
  const pulledComments = plan.commentPulls.map((comment) => ({ ...comment, origin: 'repository' as const }))
  return {
    paragraphs: nextParagraphs,
    comments: [...pulledComments, ...comments],
    pulledCount: plan.paragraphPulls.length,
  }
}

/**
 * 用最新稿库快照校对待发队列：
 * - 段落已在稿库定稿 → 审阅台改动顶不回去，标记作废（返回 dropped）。
 * - 稿库内容已与本地一致 → 无需再推，标记移除。
 */
export const reconcileOutbox = (
  outbox: OutboxEntry[],
  paragraphs: Paragraph[],
  comments: Comment[],
  repo: RepositorySnapshot,
): { keep: OutboxEntry[]; droppedFinalized: string[] } => {
  const keep: OutboxEntry[] = []
  const droppedFinalized: string[] = []
  for (const entry of outbox) {
    if (entry.kind === 'paragraph') {
      const remote = repo.paragraphs.find((item) => item.id === entry.paragraphId)
      const local = paragraphs.find((item) => item.id === entry.paragraphId)
      if (remote?.finalized) { droppedFinalized.push(entry.paragraphId); continue }
      if (remote && local && remote.text === local.text) continue
      keep.push(entry)
    } else {
      const remote = repo.comments.find((item) => item.id === entry.commentId)
      const local = comments.find((item) => item.id === entry.commentId)
      if (!local) continue
      if (remote && JSON.stringify(remote) === JSON.stringify({ ...local, origin: remote.origin })) continue
      keep.push(entry)
    }
  }
  return { keep, droppedFinalized }
}

/** 把待发标记展开成实际推送内容（以审阅台当前内容为准） */
export const resolveOutbox = (
  outbox: OutboxEntry[],
  paragraphs: Paragraph[],
  comments: Comment[],
): { paragraphIds: string[]; commentIds: string[] } => ({
  paragraphIds: outbox.filter((entry) => entry.kind === 'paragraph').map((entry) => (entry as { paragraphId: string }).paragraphId)
    .filter((id) => paragraphs.some((paragraph) => paragraph.id === id)),
  commentIds: outbox.filter((entry) => entry.kind === 'comment').map((entry) => (entry as { commentId: string }).commentId)
    .filter((id) => comments.some((comment) => comment.id === id)),
})

export const enqueueOutbox = (outbox: OutboxEntry[], entry: OutboxEntry): OutboxEntry[] => {
  const rest = outbox.filter((item) => entry.kind === 'paragraph'
    ? !(item.kind === 'paragraph' && item.paragraphId === entry.paragraphId)
    : !(item.kind === 'comment' && item.commentId === entry.commentId))
  return [...rest, entry]
}
