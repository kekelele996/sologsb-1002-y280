import { create } from 'zustand'
import type { Attribution, Comment, EditConflict, LibraryParagraph, LibraryVersion, Paragraph, Reply, Role, SyncNotice, SyncPhase, Version } from '../types'
import { armLibraryPushFailure, libraryApi } from '../services/libraryApi'

const DRAFT_KEY = 'sologsb-1002-draft-v1'
const id = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`

const baseParagraphs: Paragraph[] = [
  { id: 'p-01', section: '摘要', number: '1.', text: '开源软件供应链的稳定性不仅取决于代码质量，也取决于维护者能否持续识别并回应社区需求。', original: '开源软件供应链的稳定性不仅取决于代码质量，也取决于维护者能否持续识别并回应社区需求。', status: 'accepted', highlighted: false, finalized: false, attribution: 'review', reviewUpdatedAt: 0 },
  { id: 'p-02', section: '1 引言', number: '2.', text: '近年来，大型语言模型被广泛用于代码生成与缺陷定位，但其在真实维护工作流中的影响仍缺少系统证据。', original: '近年来，大型语言模型被广泛用于代码生成与缺陷定位，但其在真实维护工作流中的影响仍缺少系统证据。', status: 'open', highlighted: true, finalized: false, attribution: 'review', reviewUpdatedAt: 0 },
  { id: 'p-03', section: '1 引言', number: '3.', text: '本文收集 12 个活跃开源项目连续 18 个月的议题记录，并访谈 26 位核心维护者。', original: '本文收集 12 个活跃开源项目连续 18 个月的议题记录，并访谈 26 位核心维护者。', status: 'open', highlighted: true, finalized: false, attribution: 'review', reviewUpdatedAt: 0 },
  { id: 'p-04', section: '2 方法', number: '4.', text: '我们采用混合研究方法，将议题生命周期划分为响应、评审与合并三个阶段。编码过程由两名研究者独立完成。', original: '我们采用混合研究方法，将议题生命周期划分为响应、评审与合并三个阶段。编码过程由两名研究者独立完成。', status: 'open', highlighted: false, finalized: false, attribution: 'review', reviewUpdatedAt: 0 },
  { id: 'p-05', section: '2 方法', number: '5.', text: '当编码结果不一致时，研究者通过讨论达成一致；若仍有分歧，则邀请第三位研究者裁决。', original: '当编码结果不一致时，研究者通过讨论达成一致；若仍有分歧，则邀请第三位研究者裁决。', status: 'accepted', highlighted: true, finalized: false, attribution: 'review', reviewUpdatedAt: 0 },
  { id: 'p-06', section: '3 结果', number: '6.', text: '初步结果显示，辅助工具缩短了首次响应时间，但没有显著降低维护者处理复杂议题的认知负担。', original: '初步结果显示，辅助工具缩短了首次响应时间，但没有显著降低维护者处理复杂议题的认知负担。', status: 'open', highlighted: true, finalized: false, attribution: 'review', reviewUpdatedAt: 0 },
  { id: 'p-07', section: '3 结果', number: '7.', text: '在高活跃度项目中，维护者更关注建议是否可验证，而非建议生成速度。', original: '在高活跃度项目中，维护者更关注建议是否可验证，而非建议生成速度。', status: 'open', highlighted: false, finalized: false, attribution: 'review', reviewUpdatedAt: 0 },
]
const baseComments: Comment[] = [
  { id: 'c-01', paragraphId: 'p-02', author: '审稿人 A', role: 'reviewer', type: 'suggestion', quote: '其真实维护工作流中的影响', body: '建议把“影响”具体化为可观察指标。', suggestion: '近年来，大型语言模型被广泛用于代码生成与缺陷定位，但在真实维护工作流中究竟改变了哪些协作行为，仍缺少系统证据。', status: 'open', replies: [{ id: 'r-01', author: '作者', role: 'author', body: '可以，修改后会补充指标定义。', createdAt: Date.now() - 7200000 }], createdAt: Date.now() - 86400000 },
  { id: 'c-02', paragraphId: 'p-02', author: '审稿人 B', role: 'reviewer', type: 'comment', quote: '缺少系统证据', body: '这里的“系统证据”范围过大，建议限定为本研究覆盖的议题语料。', status: 'open', replies: [], createdAt: Date.now() - 64000000 },
  { id: 'c-03', paragraphId: 'p-03', author: '审稿人 A', role: 'reviewer', type: 'comment', quote: '26 位核心维护者', body: '请说明抽样方式和地域分布，避免样本选择偏差。', status: 'open', replies: [], createdAt: Date.now() - 54000000 },
  { id: 'c-04', paragraphId: 'p-04', author: '审稿人 C', role: 'reviewer', type: 'comment', quote: '两名研究者独立完成', body: '建议报告编码者间一致性系数，并明确不一致处理规则。', status: 'open', replies: [], createdAt: Date.now() - 48000000 },
  { id: 'c-05', paragraphId: 'p-05', author: '审稿人 D', role: 'reviewer', type: 'comment', quote: '邀请第三位研究者裁决', body: '与上一段重复：都在说明编码分歧如何解决，建议合并意见。', status: 'open', replies: [], createdAt: Date.now() - 43000000 },
  { id: 'c-06', paragraphId: 'p-06', author: '审稿人 B', role: 'reviewer', type: 'suggestion', quote: '但没有显著降低维护者处理复杂议题的认知负担', body: '“显著”需要给出统计检验与效应量。', suggestion: '初步结果显示，辅助工具缩短了首次响应时间，但对复杂议题处理时长与自我报告认知负担均未产生统计显著影响。', status: 'open', replies: [], createdAt: Date.now() - 36000000 },
]

/** 旧草稿升级：补齐稿库同步相关字段 */
function hydrateParagraphs(raw: Paragraph[]): Paragraph[] {
  return raw.map((paragraph) => ({
    ...paragraph,
    finalized: paragraph.finalized ?? false,
    attribution: (paragraph.attribution ?? 'review') as Attribution,
    reviewUpdatedAt: paragraph.reviewUpdatedAt ?? 0,
  }))
}

const seed = typeof localStorage !== 'undefined' ? localStorage.getItem(DRAFT_KEY) : null
const parsed = seed ? JSON.parse(seed) as Partial<{ paragraphs: Paragraph[]; comments: Comment[]; versions: Version[] }> : null
const initialParagraphs = hydrateParagraphs(parsed?.paragraphs?.length ? parsed.paragraphs : baseParagraphs)
const initialComments = parsed?.comments ?? baseComments
const initialVersions: Version[] = parsed?.versions ?? [
  { id: 'v-01', label: '投稿初稿 v1', createdAt: Date.now() - 1209600000, paragraphs: JSON.parse(JSON.stringify(baseParagraphs)) as Paragraph[] },
  { id: 'v-02', label: '审阅基线 v2', createdAt: Date.now() - 172800000, paragraphs: JSON.parse(JSON.stringify(baseParagraphs.map((p) => p.id === 'p-04' ? { ...p, text: `${p.text} 编码规则在预注册方案中说明。` } : p))) as Paragraph[] },
]

const persistDraft = (paragraphs: Paragraph[], comments: Comment[], versions: Version[]) => {
  localStorage.setItem(DRAFT_KEY, JSON.stringify({ paragraphs, comments, versions }))
}
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T

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
  // 稿库副本与同步状态
  libraryParagraphs: LibraryParagraph[]
  libraryVersions: LibraryVersion[]
  syncPhase: SyncPhase
  syncError?: string
  lastSyncedAt?: number
  syncNotices: SyncNotice[]
  pushFailureArmed: boolean
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
  undo: () => void
  redo: () => void
  save: () => void
  resetDemo: () => void
  loadLibrary: () => Promise<void>
  finalizeInLibrary: (paragraphId: string) => Promise<void>
  publishLibraryVersion: (label: string) => Promise<void>
  syncWithLibrary: () => Promise<void>
  retrySync: () => Promise<void>
  dismissSyncNotice: (noticeId: string) => void
  setPushFailureArmed: (armed: boolean) => void
}

export const useReviewStore = create<ReviewState>((set, get) => {
  const record = (producer: (state: ReviewState) => Partial<ReviewState>) => set((state) => {
    const history = { paragraphs: clone(state.paragraphs), comments: clone(state.comments), versions: clone(state.versions) }
    const next = producer(state)
    const paragraphs = next.paragraphs ?? state.paragraphs
    const comments = next.comments ?? state.comments
    const versions = next.versions ?? state.versions
    persistDraft(paragraphs, comments, versions)
    return { ...next, past: [...state.past.slice(-49), history], future: [], dirty: true }
  })

  /** 同步落盘但不进入撤销历史（同步是两边对账，不应被 Ctrl+Z 撤掉） */
  const commitSynced = (paragraphs: Paragraph[]) => {
    persistDraft(paragraphs, get().comments, get().versions)
    set({ paragraphs, dirty: true })
  }

  return {
    role: 'reviewer',
    paragraphs: initialParagraphs,
    comments: initialComments,
    versions: initialVersions,
    selectedParagraphId: 'p-02',
    commentFilter: 'all',
    revisionMode: false,
    dirty: false,
    conflicts: [],
    past: [],
    future: [],
    libraryParagraphs: [],
    libraryVersions: [],
    syncPhase: 'idle',
    syncNotices: [],
    pushFailureArmed: false,
    setRole: (role) => set({ role, selectedParagraphId: get().paragraphs[0]?.id ?? '' }),
    selectParagraph: (selectedParagraphId) => set({ selectedParagraphId }),
    setCommentFilter: (commentFilter) => set({ commentFilter }),
    setRevisionMode: (revisionMode) => set({ revisionMode }),
    updateParagraph: (paragraphId, text) => record((state) => ({
      paragraphs: state.paragraphs.map((paragraph) => paragraph.id === paragraphId && paragraph.status !== 'locked'
        ? { ...paragraph, text, status: 'open' as const, highlighted: true, attribution: 'review' as Attribution, reviewUpdatedAt: Date.now() }
        : paragraph),
    })),
    addComment: (input) => record((state) => ({
      comments: [{
        ...input,
        id: id('comment'),
        author: state.role === 'reviewer' ? '审稿人 A' : state.role === 'author' ? '作者' : '编辑',
        role: state.role,
        status: 'open',
        replies: [],
        createdAt: Date.now(),
      }, ...state.comments],
    })),
    replyComment: (commentId, body) => record((state) => ({
      comments: state.comments.map((comment) => comment.id === commentId ? {
        ...comment,
        replies: [...comment.replies, { id: id('reply'), author: state.role === 'author' ? '作者' : state.role === 'reviewer' ? '审稿人 A' : '编辑', role: state.role, body, createdAt: Date.now() } as Reply],
      } : comment),
    })),
    resolveSuggestion: (commentId, accepted) => record((state) => {
      const comment = state.comments.find((item) => item.id === commentId)
      return {
        comments: state.comments.map((item) => item.id === commentId ? { ...item, status: accepted ? 'accepted' : 'rejected' } : item),
        paragraphs: comment?.suggestion && accepted
          ? state.paragraphs.map((paragraph) => paragraph.id === comment.paragraphId
            ? { ...paragraph, text: comment.suggestion as string, status: 'accepted', attribution: 'review' as Attribution, reviewUpdatedAt: Date.now() }
            : paragraph)
          : state.paragraphs,
      }
    }),
    mergeComment: (commentId, targetId) => record((state) => ({
      comments: state.comments.map((comment) => comment.id === commentId ? { ...comment, status: 'merged', mergedInto: targetId } : comment),
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
      return {
        paragraphs: conflict && strategy === 'remote'
          ? state.paragraphs.map((paragraph) => paragraph.id === conflict.paragraphId ? { ...paragraph, text: conflict.remoteText, highlighted: true, attribution: 'review' as Attribution, reviewUpdatedAt: Date.now() } : paragraph)
          : state.paragraphs,
        conflicts: state.conflicts.filter((item) => item.id !== conflictId),
      }
    }),
    dismissConflict: (conflictId) => set((state) => ({ conflicts: state.conflicts.filter((item) => item.id !== conflictId) })),
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
      set({ dirty: false })
    },
    resetDemo: () => {
      localStorage.removeItem(DRAFT_KEY)
      libraryApi.reset()
      set({ paragraphs: clone(baseParagraphs), comments: clone(baseComments), versions: clone(initialVersions), conflicts: [], past: [], future: [], dirty: false, libraryParagraphs: [], libraryVersions: [], syncPhase: 'idle', syncError: undefined, lastSyncedAt: undefined, syncNotices: [], pushFailureArmed: false })
      persistDraft(baseParagraphs, baseComments, initialVersions)
      void get().loadLibrary()
    },

    loadLibrary: async () => {
      const state = get()
      const lib = await libraryApi.initialize(state.paragraphs.map((paragraph) => ({ paragraphId: paragraph.id, text: paragraph.original })))
      set({ libraryParagraphs: lib.paragraphs, libraryVersions: lib.versions })
    },

    finalizeInLibrary: async (paragraphId) => {
      const paragraph = get().paragraphs.find((item) => item.id === paragraphId)
      if (!paragraph) return
      const lib = await libraryApi.finalizeParagraph(paragraphId, paragraph.text)
      const libraryCopy = lib.paragraphs.find((item) => item.paragraphId === paragraphId)
      const now = Date.now()
      const paragraphs = get().paragraphs.map((item) => item.id === paragraphId ? {
        ...item,
        text: libraryCopy?.text ?? item.text,
        finalized: true,
        finalizedAt: libraryCopy?.finalizedAt ?? now,
        attribution: 'library' as Attribution,
        libraryUpdatedAt: libraryCopy?.updatedAt ?? now,
        syncedAt: now,
      } : item)
      set({ libraryParagraphs: lib.paragraphs, libraryVersions: lib.versions })
      commitSynced(paragraphs)
    },

    publishLibraryVersion: async (label) => {
      const lib = await libraryApi.publishVersion(label.trim() || `稿库版本 ${get().libraryVersions.length + 1}`)
      set({ libraryVersions: lib.versions })
    },

    syncWithLibrary: async () => {
      const state = get()
      if (state.syncPhase === 'syncing') return
      set({ syncPhase: 'syncing', syncError: undefined })
      // 1. 拉取稿库：稿库已定稿内容照旧可查
      const lib = await libraryApi.fetchState()
      // 2. 只挑审阅台有改动、且尚未同步的段落（已定稿段落不推，避免顶回稿库）
      const pending = state.paragraphs
        .filter((paragraph) => !paragraph.finalized && paragraph.reviewUpdatedAt > (paragraph.syncedAt ?? 0))
        .map((paragraph) => ({ paragraphId: paragraph.id, text: paragraph.text, reviewUpdatedAt: paragraph.reviewUpdatedAt }))
      // 3. 推送这一侧；失败则审阅台改动原样留着，等重试
      const result = pending.length
        ? await libraryApi.pushReviewPatches(pending)
        : { ok: true as const, revision: lib.revision }
      set({ pushFailureArmed: false })
      const notices: SyncNotice[] = []
      const libMap = new Map(lib.paragraphs.map((item) => [item.paragraphId, item]))
      if (result.ok) {
        const now = Date.now()
        // 4. 两边对账：已定稿以稿库为准，未定稿以审阅台为准；
        //    批注、建议、回复一律不在同步中增删改。
        const paragraphs = state.paragraphs.map((paragraph) => {
          const libraryCopy = libMap.get(paragraph.id)
          if (libraryCopy?.finalized) {
            if (paragraph.text !== libraryCopy.text || !paragraph.finalized) {
              notices.push({
                id: id('notice'), type: 'warning',
                message: `段落 ${paragraph.number} 已在稿库定稿，以稿库版本为准；审阅台的不同表述不再推送，批注与建议保留不变。`,
                createdAt: now,
              })
            }
            return {
              ...paragraph,
              text: libraryCopy.text,
              finalized: true,
              finalizedAt: libraryCopy.finalizedAt,
              attribution: 'library' as Attribution,
              libraryUpdatedAt: libraryCopy.updatedAt,
              syncedAt: now,
            }
          }
          return {
            ...paragraph,
            finalized: false,
            attribution: 'review' as Attribution,
            syncedAt: pending.some((item) => item.paragraphId === paragraph.id) ? now : paragraph.syncedAt,
          }
        })
        const finalizedCount = lib.paragraphs.filter((item) => item.finalized).length
        notices.unshift({
          id: id('notice'), type: 'info',
          message: `同步完成：推送审阅台改动 ${pending.length} 段，稿库已定稿 ${finalizedCount} 段已对齐；批注与建议均保留。`,
          createdAt: now,
        })
        set({
          paragraphs,
          libraryParagraphs: lib.paragraphs,
          libraryVersions: lib.versions,
          syncPhase: 'success',
          lastSyncedAt: now,
          syncNotices: notices,
        })
        commitSynced(paragraphs)
      } else {
        // 对接失败：审阅台改动不回滚（按 reviewUpdatedAt 保留待推送状态），
        // 稿库定稿内容已随拉取更新、照旧可查。
        notices.unshift({
          id: id('notice'), type: 'error',
          message: `稿库对接失败：${result.error ?? '未知错误'}。审阅台改动已暂存，可点击重试（只补没推上去的段落）；稿库已定稿内容仍可在稿库面板查询。`,
          createdAt: Date.now(),
        })
        set({
          libraryParagraphs: lib.paragraphs,
          libraryVersions: lib.versions,
          syncPhase: 'failed',
          syncError: result.error,
          syncNotices: notices,
        })
      }
    },

    retrySync: async () => {
      await get().syncWithLibrary()
    },

    dismissSyncNotice: (noticeId) => set((state) => ({
      syncNotices: state.syncNotices.filter((notice) => notice.id !== noticeId),
    })),

    setPushFailureArmed: (armed) => {
      if (armed) armLibraryPushFailure()
      set({ pushFailureArmed: armed })
    },
  }
})
