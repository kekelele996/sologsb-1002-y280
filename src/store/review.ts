import { create } from 'zustand'
import type { Comment, EditConflict, OutboxEntry, Paragraph, Reply, RepositorySnapshot, Role, SyncLogEntry, Version } from '../types'
import {
  ensureRepository, fetchRepository, finalizeInRepository, publishVersionInRepository,
  pushCommentsToRepository, pushParagraphsToRepository, resetRepository, setRepositoryOnline, unfinalizeInRepository,
} from '../services/mockApi'
import { applyPull, enqueueOutbox, planSync, reconcileOutbox, resolveOutbox } from '../services/sync'

const DRAFT_KEY = 'sologsb-1002-draft-v2'
const LEGACY_DRAFT_KEY = 'sologsb-1002-draft-v1'
const OUTBOX_KEY = 'sologsb-1002-outbox-v1'
const id = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`

const baseParagraphs: Paragraph[] = [
  { id: 'p-01', section: '摘要', number: '1.', text: '开源软件供应链的稳定性不仅取决于代码质量，也取决于维护者能否持续识别并回应社区需求。', original: '开源软件供应链的稳定性不仅取决于代码质量，也取决于维护者能否持续识别并回应社区需求。', status: 'accepted', highlighted: false },
  { id: 'p-02', section: '1 引言', number: '2.', text: '近年来，大型语言模型被广泛用于代码生成与缺陷定位，但其在真实维护工作流中的影响仍缺少系统证据。', original: '近年来，大型语言模型被广泛用于代码生成与缺陷定位，但其在真实维护工作流中的影响仍缺少系统证据。', status: 'open', highlighted: true },
  { id: 'p-03', section: '1 引言', number: '3.', text: '本文收集 12 个活跃开源项目连续 18 个月的议题记录，并访谈 26 位核心维护者。', original: '本文收集 12 个活跃开源项目连续 18 个月的议题记录，并访谈 26 位核心维护者。', status: 'open', highlighted: true },
  { id: 'p-04', section: '2 方法', number: '4.', text: '我们采用混合研究方法，将议题生命周期划分为响应、评审与合并三个阶段。编码过程由两名研究者独立完成。', original: '我们采用混合研究方法，将议题生命周期划分为响应、评审与合并三个阶段。编码过程由两名研究者独立完成。', status: 'open', highlighted: false },
  { id: 'p-05', section: '2 方法', number: '5.', text: '当编码结果不一致时，研究者通过讨论达成一致；若仍有分歧，则邀请第三位研究者裁决。', original: '当编码结果不一致时，研究者通过讨论达成一致；若仍有分歧，则邀请第三位研究者裁决。', status: 'accepted', highlighted: true },
  { id: 'p-06', section: '3 结果', number: '6.', text: '初步结果显示，辅助工具缩短了首次响应时间，但没有显著降低维护者处理复杂议题的认知负担。', original: '初步结果显示，辅助工具缩短了首次响应时间，但没有显著降低维护者处理复杂议题的认知负担。', status: 'open', highlighted: true },
  { id: 'p-07', section: '3 结果', number: '7.', text: '在高活跃度项目中，维护者更关注建议是否可验证，而非建议生成速度。', original: '在高活跃度项目中，维护者更关注建议是否可验证，而非建议生成速度。', status: 'open', highlighted: false },
]
const baseComments: Comment[] = [
  { id: 'c-01', paragraphId: 'p-02', author: '审稿人 A', role: 'reviewer', type: 'suggestion', quote: '其真实维护工作流中的影响', body: '建议把“影响”具体化为可观察指标。', suggestion: '近年来，大型语言模型被广泛用于代码生成与缺陷定位，但在真实维护工作流中究竟改变了哪些协作行为，仍缺少系统证据。', status: 'open', replies: [{ id: 'r-01', author: '作者', role: 'author', body: '可以，修改后会补充指标定义。', createdAt: Date.now() - 7200000 }], createdAt: Date.now() - 86400000 },
  { id: 'c-02', paragraphId: 'p-02', author: '审稿人 B', role: 'reviewer', type: 'comment', quote: '缺少系统证据', body: '这里的“系统证据”范围过大，建议限定为本研究覆盖的议题语料。', status: 'open', replies: [], createdAt: Date.now() - 64000000 },
  { id: 'c-03', paragraphId: 'p-03', author: '审稿人 A', role: 'reviewer', type: 'comment', quote: '26 位核心维护者', body: '请说明抽样方式和地域分布，避免样本选择偏差。', status: 'open', replies: [], createdAt: Date.now() - 54000000 },
  { id: 'c-04', paragraphId: 'p-04', author: '审稿人 C', role: 'reviewer', type: 'comment', quote: '两名研究者独立完成', body: '建议报告编码者间一致性系数，并明确不一致处理规则。', status: 'open', replies: [], createdAt: Date.now() - 48000000 },
  { id: 'c-05', paragraphId: 'p-05', author: '审稿人 D', role: 'reviewer', type: 'comment', quote: '邀请第三位研究者裁决', body: '与上一段重复：都在说明编码分歧如何解决，建议合并意见。', status: 'open', replies: [], createdAt: Date.now() - 43000000 },
  { id: 'c-06', paragraphId: 'p-06', author: '审稿人 B', role: 'reviewer', type: 'suggestion', quote: '但没有显著降低维护者处理复杂议题的认知负担', body: '“显著”需要给出统计检验与效应量。', suggestion: '初步结果显示，辅助工具缩短了首次响应时间，但对复杂议题处理时长与自我报告认知负担均未产生统计显著影响。', status: 'open', replies: [], createdAt: Date.now() - 36000000 },
]
const fallbackVersions: Version[] = [
  { id: 'v-01', label: '投稿初稿 v1', createdAt: Date.now() - 1209600000, paragraphs: JSON.parse(JSON.stringify(baseParagraphs)) as Paragraph[] },
  { id: 'v-02', label: '审阅基线 v2', createdAt: Date.now() - 172800000, paragraphs: JSON.parse(JSON.stringify(baseParagraphs.map((p) => p.id === 'p-04' ? { ...p, text: `${p.text} 编码规则在预注册方案中说明。` } : p))) as Paragraph[] },
]

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T

/** 旧数据没有归属信息：已确认/锁定的段落归稿库（视同已定稿），其余归审阅台 */
const backfillAttribution = (paragraph: Paragraph, note?: string): Paragraph => {
  if (paragraph.attribution) return paragraph
  const finalized = paragraph.finalized ?? paragraph.status !== 'open'
  return {
    ...paragraph,
    finalized,
    finalizedAt: finalized ? paragraph.finalizedAt ?? Date.now() : undefined,
    attribution: { side: finalized ? 'repository' : 'review', updatedAt: Date.now(), note },
  }
}

interface DraftShape { paragraphs: Paragraph[]; comments: Comment[]; versions: Version[] }

const persistDraft = (paragraphs: Paragraph[], comments: Comment[], versions: Version[]) => {
  localStorage.setItem(DRAFT_KEY, JSON.stringify({ version: 2, paragraphs, comments, versions }))
}
const persistOutbox = (outbox: OutboxEntry[]) => {
  localStorage.setItem(OUTBOX_KEY, JSON.stringify(outbox))
}

const loadDraft = (): DraftShape => {
  if (typeof localStorage === 'undefined') {
    return { paragraphs: baseParagraphs.map((p) => backfillAttribution(p)), comments: baseComments, versions: fallbackVersions }
  }
  const rawV2 = localStorage.getItem(DRAFT_KEY)
  if (rawV2) {
    const parsed = JSON.parse(rawV2) as Partial<DraftShape>
    return {
      paragraphs: parsed.paragraphs?.length ? parsed.paragraphs : baseParagraphs,
      comments: parsed.comments ?? baseComments,
      versions: parsed.versions ?? fallbackVersions,
    }
  }
  const rawV1 = localStorage.getItem(LEGACY_DRAFT_KEY)
  if (rawV1) {
    // 旧数据升级：审阅台与稿库两边都补上归属
    const legacy = JSON.parse(rawV1) as Partial<DraftShape>
    const migrated: DraftShape = {
      paragraphs: (legacy.paragraphs?.length ? legacy.paragraphs : baseParagraphs).map((p) => backfillAttribution(p, '旧数据迁移补录')),
      comments: (legacy.comments ?? baseComments).map((comment) => ({ ...comment, origin: comment.origin ?? 'review' as const })),
      versions: legacy.versions ?? fallbackVersions,
    }
    persistDraft(migrated.paragraphs, migrated.comments, migrated.versions)
    localStorage.removeItem(LEGACY_DRAFT_KEY)
    return migrated
  }
  return {
    paragraphs: baseParagraphs.map((p) => backfillAttribution(p)),
    comments: baseComments.map((comment) => ({ ...comment, origin: 'review' as const })),
    versions: fallbackVersions,
  }
}

const loadOutbox = (): OutboxEntry[] => {
  if (typeof localStorage === 'undefined') return []
  const raw = localStorage.getItem(OUTBOX_KEY)
  return raw ? JSON.parse(raw) as OutboxEntry[] : []
}

const initialDraft = loadDraft()
const initialOutbox = loadOutbox()
let initialRepository: RepositorySnapshot | null = null
try {
  initialRepository = ensureRepository(initialDraft.paragraphs, initialDraft.comments)
} catch {
  initialRepository = null
}

interface ReviewState {
  role: Role
  paragraphs: Paragraph[]
  comments: Comment[]
  versions: Version[]
  selectedParagraphId: string
  commentFilter: 'all' | 'open' | 'suggestion' | 'duplicate'
  revisionMode: boolean
  dirty: boolean
  conflicts: EditConflict[]
  past: { paragraphs: Paragraph[]; comments: Comment[]; versions: Version[] }[]
  future: { paragraphs: Paragraph[]; comments: Comment[]; versions: Version[] }[]
  /** 稿库最近快照（断连时照旧可查已定稿内容） */
  repository: RepositorySnapshot | null
  /** 对接失败后留在审阅台、等待补推到稿库的标记 */
  outbox: OutboxEntry[]
  syncStatus: 'idle' | 'syncing' | 'error'
  syncError?: string
  lastSyncAt?: number
  repoOffline: boolean
  syncLog: SyncLogEntry[]
  setRole: (role: Role) => void
  selectParagraph: (id: string) => void
  setCommentFilter: (filter: ReviewState['commentFilter']) => void
  setRevisionMode: (value: boolean) => void
  updateParagraph: (id: string, text: string) => void
  addComment: (input: Pick<Comment, 'paragraphId' | 'type' | 'quote' | 'body' | 'suggestion'>) => void
  replyComment: (commentId: string, body: string) => void
  resolveSuggestion: (commentId: string, accepted: boolean) => void
  mergeComment: (commentId: string, targetId: string) => void
  toggleLock: (paragraphId: string) => void
  createVersion: (label: string) => void
  addConflict: (conflict: EditConflict) => void
  resolveConflict: (conflictId: string, strategy: 'local' | 'remote') => void
  dismissConflict: (conflictId: string) => void
  syncWithRepository: () => Promise<void>
  retrySync: () => Promise<void>
  finalizeParagraph: (paragraphId: string) => Promise<boolean>
  unfinalizeParagraph: (paragraphId: string) => Promise<boolean>
  publishJournalVersion: (label: string) => Promise<boolean>
  setRepoOffline: (offline: boolean) => void
  undo: () => void
  redo: () => void
  save: () => void
  resetDemo: () => void
}

export const useReviewStore = create<ReviewState>((set, get) => {
  const record = (producer: (state: ReviewState) => Partial<ReviewState>) => set((state) => {
    const history = { paragraphs: clone(state.paragraphs), comments: clone(state.comments), versions: clone(state.versions) }
    const next = producer(state)
    const paragraphs = next.paragraphs ?? state.paragraphs
    const comments = next.comments ?? state.comments
    const versions = next.versions ?? state.versions
    const outbox = next.outbox ?? state.outbox
    persistDraft(paragraphs, comments, versions)
    persistOutbox(outbox)
    return { ...next, past: [...state.past.slice(-49), history], future: [], dirty: true }
  })

  const appendLog = (level: SyncLogEntry['level'], message: string) => set((state) => ({
    syncLog: [{ id: id('log'), at: Date.now(), level, message }, ...state.syncLog].slice(0, 60),
  }))

  return {
    role: 'reviewer',
    paragraphs: initialDraft.paragraphs,
    comments: initialDraft.comments,
    versions: initialDraft.versions,
    selectedParagraphId: 'p-02',
    commentFilter: 'all',
    revisionMode: false,
    dirty: false,
    conflicts: [],
    past: [],
    future: [],
    repository: initialRepository,
    outbox: initialOutbox,
    syncStatus: 'idle',
    syncError: undefined,
    lastSyncAt: undefined,
    repoOffline: false,
    syncLog: [],
    setRole: (role) => set({ role, selectedParagraphId: get().paragraphs[0]?.id ?? '' }),
    selectParagraph: (selectedParagraphId) => set({ selectedParagraphId }),
    setCommentFilter: (commentFilter) => set({ commentFilter }),
    setRevisionMode: (revisionMode) => set({ revisionMode }),
    updateParagraph: (paragraphId, text) => {
      const target = get().paragraphs.find((paragraph) => paragraph.id === paragraphId)
      // 已定稿（以稿库为准）与已锁定的段落不接受审阅台改动
      if (!target || target.status === 'locked' || target.finalized) return
      record((state) => ({
        paragraphs: state.paragraphs.map((paragraph) => paragraph.id === paragraphId
          ? { ...paragraph, text, status: 'open' as const, highlighted: true, attribution: { side: 'review' as const, updatedAt: Date.now() } }
          : paragraph),
        outbox: enqueueOutbox(state.outbox, { kind: 'paragraph', paragraphId, enqueuedAt: Date.now() }),
      }))
    },
    addComment: (input) => record((state) => {
      const comment: Comment = {
        ...input,
        id: id('comment'),
        author: state.role === 'reviewer' ? '审稿人 A' : state.role === 'author' ? '作者' : '编辑',
        role: state.role,
        status: 'open',
        replies: [],
        createdAt: Date.now(),
        origin: 'review',
      }
      return {
        comments: [comment, ...state.comments],
        outbox: enqueueOutbox(state.outbox, { kind: 'comment', commentId: comment.id, enqueuedAt: Date.now() }),
      }
    }),
    replyComment: (commentId, body) => record((state) => ({
      comments: state.comments.map((comment) => comment.id === commentId ? {
        ...comment,
        replies: [...comment.replies, { id: id('reply'), author: state.role === 'author' ? '作者' : state.role === 'reviewer' ? '审稿人 A' : '编辑', role: state.role, body, createdAt: Date.now() } as Reply],
      } : comment),
      outbox: enqueueOutbox(state.outbox, { kind: 'comment', commentId, enqueuedAt: Date.now() }),
    })),
    resolveSuggestion: (commentId, accepted) => record((state) => {
      const comment = state.comments.find((item) => item.id === commentId)
      const target = comment ? state.paragraphs.find((item) => item.id === comment.paragraphId) : undefined
      const applyText = Boolean(comment?.suggestion && accepted && target && !target.finalized && target.status !== 'locked')
      return {
        comments: state.comments.map((item) => item.id === commentId ? { ...item, status: accepted ? 'accepted' : 'rejected' } : item),
        paragraphs: applyText
          ? state.paragraphs.map((paragraph) => paragraph.id === comment?.paragraphId
            ? { ...paragraph, text: comment?.suggestion as string, status: 'accepted', attribution: { side: 'review' as const, updatedAt: Date.now() } }
            : paragraph)
          : state.paragraphs,
        outbox: enqueueOutbox(
          applyText && comment ? enqueueOutbox(state.outbox, { kind: 'paragraph', paragraphId: comment.paragraphId, enqueuedAt: Date.now() }) : state.outbox,
          { kind: 'comment', commentId, enqueuedAt: Date.now() },
        ),
      }
    }),
    mergeComment: (commentId, targetId) => record((state) => ({
      comments: state.comments.map((comment) => comment.id === commentId ? { ...comment, status: 'merged', mergedInto: targetId } : comment),
      outbox: enqueueOutbox(state.outbox, { kind: 'comment', commentId, enqueuedAt: Date.now() }),
    })),
    toggleLock: (paragraphId) => record((state) => ({
      paragraphs: state.paragraphs.map((paragraph) => paragraph.id === paragraphId ? {
        ...paragraph,
        status: paragraph.status === 'locked' ? 'accepted' : 'locked',
      } : paragraph),
    })),
    createVersion: (label) => record((state) => ({
      versions: [{ id: id('version'), label: label.trim() || `版本 ${state.versions.length + 1}`, createdAt: Date.now(), paragraphs: clone(state.paragraphs) }, ...state.versions],
    })),
    addConflict: (conflict) => set((state) => ({ conflicts: [conflict, ...state.conflicts] })),
    resolveConflict: (conflictId, strategy) => record((state) => {
      const conflict = state.conflicts.find((item) => item.id === conflictId)
      const applyRemote = Boolean(conflict && strategy === 'remote'
        && !state.paragraphs.find((paragraph) => paragraph.id === conflict.paragraphId)?.finalized)
      return {
        paragraphs: conflict && applyRemote
          ? state.paragraphs.map((paragraph) => paragraph.id === conflict.paragraphId
            ? { ...paragraph, text: conflict.remoteText, highlighted: true, attribution: { side: 'review' as const, updatedAt: Date.now() } }
            : paragraph)
          : state.paragraphs,
        outbox: conflict && applyRemote
          ? enqueueOutbox(state.outbox, { kind: 'paragraph', paragraphId: conflict.paragraphId, enqueuedAt: Date.now() })
          : state.outbox,
        conflicts: state.conflicts.filter((item) => item.id !== conflictId),
      }
    }),
    dismissConflict: (conflictId) => set((state) => ({ conflicts: state.conflicts.filter((item) => item.id !== conflictId) })),
    syncWithRepository: async () => {
      if (get().syncStatus === 'syncing') return
      set({ syncStatus: 'syncing', syncError: undefined })
      let repo: RepositorySnapshot
      try {
        repo = await fetchRepository()
      } catch (error) {
        const message = error instanceof Error ? error.message : '未知错误'
        appendLog('error', `对接失败：${message}。审阅台改动已保留等待重试，稿库已定稿内容仍可查最近快照`)
        set({ syncStatus: 'error', syncError: message })
        return
      }
      const plan = planSync(get().paragraphs, get().comments, repo)
      const pulled = applyPull(get().paragraphs, get().comments, repo, plan)
      if (pulled.pulledCount > 0) appendLog('info', `从稿库拉回 ${pulled.pulledCount} 个已定稿段落（已定稿的以稿库为准）`)
      if (plan.commentPulls.length > 0) appendLog('info', `从稿库并入 ${plan.commentPulls.length} 条意见，审阅台已有批注与建议原样保留`)
      const { keep, droppedFinalized } = reconcileOutbox(get().outbox, pulled.paragraphs, pulled.comments, repo)
      if (droppedFinalized.length > 0) appendLog('info', `${droppedFinalized.length} 个段落已在稿库定稿，审阅台的待发改动不再顶回稿库`)
      const resolved = resolveOutbox(keep, pulled.paragraphs, pulled.comments)
      const paragraphIds = Array.from(new Set([...plan.paragraphPushes, ...resolved.paragraphIds]))
      const commentIds = Array.from(new Set([...plan.commentUploads, ...resolved.commentIds]))
      let snapshot = repo
      const remaining: OutboxEntry[] = []
      if (paragraphIds.length > 0) {
        const payloads = paragraphIds.map((paragraphId) => {
          const paragraph = pulled.paragraphs.find((item) => item.id === paragraphId) as Paragraph
          return { paragraphId, section: paragraph.section, number: paragraph.number, text: paragraph.text, updatedAt: paragraph.attribution?.updatedAt ?? Date.now() }
        })
        try {
          const result = await pushParagraphsToRepository(payloads)
          snapshot = result.snapshot
          appendLog('success', `以审阅台为准向稿库补推 ${paragraphIds.length - result.skipped.length} 个未定稿段落`)
          if (result.skipped.length > 0) appendLog('info', `段落 ${result.skipped.join('、')} 已在稿库定稿，审阅台改动未顶回稿库`)
        } catch (error) {
          const message = error instanceof Error ? error.message : '未知错误'
          remaining.push(...paragraphIds.map((paragraphId) => ({ kind: 'paragraph' as const, paragraphId, enqueuedAt: Date.now() })))
          appendLog('error', `段落补推失败：${message}，已留在审阅台等待重试`)
        }
      }
      if (commentIds.length > 0) {
        const payloads = commentIds.map((commentId) => pulled.comments.find((item) => item.id === commentId) as Comment)
        try {
          const result = await pushCommentsToRepository(payloads)
          snapshot = result.snapshot
          appendLog('success', `向稿库补推 ${payloads.length} 条批注/建议`)
        } catch (error) {
          const message = error instanceof Error ? error.message : '未知错误'
          remaining.push(...commentIds.map((commentId) => ({ kind: 'comment' as const, commentId, enqueuedAt: Date.now() })))
          appendLog('error', `意见补推失败：${message}，已留在审阅台等待重试`)
        }
      }
      if (paragraphIds.length === 0 && commentIds.length === 0 && pulled.pulledCount === 0 && plan.commentPulls.length === 0) {
        appendLog('info', '两侧正文与意见已一致，无需补推')
      }
      persistDraft(pulled.paragraphs, pulled.comments, get().versions)
      persistOutbox(remaining)
      set({
        paragraphs: pulled.paragraphs,
        comments: pulled.comments,
        repository: snapshot,
        outbox: remaining,
        syncStatus: remaining.length > 0 ? 'error' : 'idle',
        syncError: remaining.length > 0 ? '部分内容未推送到稿库，已留在审阅台等待重试' : undefined,
        lastSyncAt: Date.now(),
      })
    },
    retrySync: async () => {
      const state = get()
      if (state.syncStatus === 'syncing') return
      if (state.outbox.length === 0) { appendLog('info', '没有待补推的内容'); return }
      set({ syncStatus: 'syncing', syncError: undefined })
      appendLog('info', `重试补推 ${state.outbox.length} 项：只补没上去的稿库一侧，审阅台内容不再重拉`)
      const resolved = resolveOutbox(state.outbox, state.paragraphs, state.comments)
      let snapshot = state.repository
      const remaining: OutboxEntry[] = []
      if (resolved.paragraphIds.length > 0) {
        const payloads = resolved.paragraphIds.map((paragraphId) => {
          const paragraph = state.paragraphs.find((item) => item.id === paragraphId) as Paragraph
          return { paragraphId, section: paragraph.section, number: paragraph.number, text: paragraph.text, updatedAt: paragraph.attribution?.updatedAt ?? Date.now() }
        })
        try {
          const result = await pushParagraphsToRepository(payloads)
          snapshot = result.snapshot
          appendLog('success', `重试成功：向稿库补推 ${resolved.paragraphIds.length - result.skipped.length} 个段落`)
          if (result.skipped.length > 0) appendLog('info', `段落 ${result.skipped.join('、')} 已在稿库定稿，审阅台改动未顶回稿库`)
        } catch (error) {
          const message = error instanceof Error ? error.message : '未知错误'
          remaining.push(...resolved.paragraphIds.map((paragraphId) => ({ kind: 'paragraph' as const, paragraphId, enqueuedAt: Date.now() })))
          appendLog('error', `段落重试仍失败：${message}，内容继续留在审阅台`)
        }
      }
      if (resolved.commentIds.length > 0) {
        const payloads = resolved.commentIds.map((commentId) => state.comments.find((item) => item.id === commentId) as Comment)
        try {
          const result = await pushCommentsToRepository(payloads)
          snapshot = result.snapshot
          appendLog('success', `重试成功：向稿库补推 ${payloads.length} 条批注/建议`)
        } catch (error) {
          const message = error instanceof Error ? error.message : '未知错误'
          remaining.push(...resolved.commentIds.map((commentId) => ({ kind: 'comment' as const, commentId, enqueuedAt: Date.now() })))
          appendLog('error', `意见重试仍失败：${message}，内容继续留在审阅台`)
        }
      }
      persistOutbox(remaining)
      set({
        outbox: remaining,
        repository: snapshot ?? state.repository,
        syncStatus: remaining.length > 0 ? 'error' : 'idle',
        syncError: remaining.length > 0 ? '仍有内容未推送到稿库' : undefined,
        lastSyncAt: remaining.length > 0 ? state.lastSyncAt : Date.now(),
      })
    },
    finalizeParagraph: async (paragraphId) => {
      const paragraph = get().paragraphs.find((item) => item.id === paragraphId)
      if (!paragraph) return false
      try {
        const snapshot = await finalizeInRepository(paragraphId, paragraph.text, '编辑')
        set((state) => ({
          repository: snapshot,
          paragraphs: state.paragraphs.map((item) => item.id === paragraphId ? {
            ...item,
            finalized: true,
            finalizedAt: Date.now(),
            status: item.status === 'locked' ? item.status : 'accepted' as const,
            attribution: { side: 'repository' as const, updatedAt: Date.now() },
          } : item),
          outbox: state.outbox.filter((entry) => !(entry.kind === 'paragraph' && entry.paragraphId === paragraphId)),
        }))
        persistDraft(get().paragraphs, get().comments, get().versions)
        persistOutbox(get().outbox)
        appendLog('success', `段落 ${paragraph.number} 已在稿库定稿，此后以稿库为准`)
        return true
      } catch (error) {
        appendLog('error', `定稿失败：${error instanceof Error ? error.message : '未知错误'}`)
        return false
      }
    },
    unfinalizeParagraph: async (paragraphId) => {
      const paragraph = get().paragraphs.find((item) => item.id === paragraphId)
      if (!paragraph) return false
      try {
        const snapshot = await unfinalizeInRepository(paragraphId)
        set((state) => ({
          repository: snapshot,
          paragraphs: state.paragraphs.map((item) => item.id === paragraphId ? {
            ...item,
            finalized: false,
            finalizedAt: undefined,
            attribution: { side: 'repository' as const, updatedAt: Date.now() },
          } : item),
        }))
        persistDraft(get().paragraphs, get().comments, get().versions)
        appendLog('info', `段落 ${paragraph.number} 已在稿库取消定稿，此后以审阅台为准`)
        return true
      } catch (error) {
        appendLog('error', `取消定稿失败：${error instanceof Error ? error.message : '未知错误'}`)
        return false
      }
    },
    publishJournalVersion: async (label) => {
      try {
        const { snapshot, version } = await publishVersionInRepository(label)
        set({ repository: snapshot })
        appendLog('success', `编辑在稿库出新版本「${version.label}」，快照 ${version.paragraphs.length} 个段落`)
        return true
      } catch (error) {
        appendLog('error', `出稿库版本失败：${error instanceof Error ? error.message : '未知错误'}`)
        return false
      }
    },
    setRepoOffline: (offline) => {
      setRepositoryOnline(!offline)
      set({ repoOffline: offline })
      appendLog('info', offline ? '已模拟稿库断连：写入会失败，已定稿内容仍可查最近快照' : '稿库连接已恢复，可重试补推或重新对接')
    },
    undo: () => set((state) => {
      const previous = state.past.at(-1)
      if (!previous) return state
      const current = { paragraphs: clone(state.paragraphs), comments: clone(state.comments), versions: clone(state.versions) }
      persistDraft(previous.paragraphs, previous.comments, previous.versions)
      return { ...previous, past: state.past.slice(0, -1), future: [current, ...state.future], dirty: true }
    }),
    redo: () => set((state) => {
      const next = state.future[0]
      if (!next) return state
      const current = { paragraphs: clone(state.paragraphs), comments: clone(state.comments), versions: clone(state.versions) }
      persistDraft(next.paragraphs, next.comments, next.versions)
      return { ...next, past: [...state.past, current], future: state.future.slice(1), dirty: true }
    }),
    save: () => {
      persistDraft(get().paragraphs, get().comments, get().versions)
      persistOutbox(get().outbox)
      set({ dirty: false })
    },
    resetDemo: () => {
      localStorage.removeItem(DRAFT_KEY)
      localStorage.removeItem(LEGACY_DRAFT_KEY)
      localStorage.removeItem(OUTBOX_KEY)
      resetRepository()
      const paragraphs = baseParagraphs.map((paragraph) => backfillAttribution(paragraph))
      const comments = baseComments.map((comment) => ({ ...comment, origin: 'review' as const }))
      let repository: RepositorySnapshot | null = null
      try { repository = ensureRepository(paragraphs, comments) } catch { repository = null }
      persistDraft(paragraphs, comments, fallbackVersions)
      persistOutbox([])
      set({
        paragraphs: clone(paragraphs), comments: clone(comments), versions: clone(fallbackVersions),
        conflicts: [], past: [], future: [], dirty: false,
        repository, outbox: [], syncStatus: 'idle', syncError: undefined, lastSyncAt: undefined, syncLog: [],
      })
    },
  }
})
