import type { Attribution, LibraryParagraph, LibraryVersion } from '../types'

/**
 * 期刊稿库模拟接口。
 * 稿库与审阅台各存一份正文：编辑在稿库定稿、发布版本；
 * 审阅台通过 pushReviewPatches 把未定稿段落的改动推上来。
 * 稿库已定稿的段落绝不会被审阅台改动顶回去。
 */
const LIBRARY_KEY = 'sologsb-1002-library-v1'
const REVIEW_DRAFT_KEY = 'sologsb-1002-draft-v1'

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds))

export interface LibraryState {
  paragraphs: LibraryParagraph[]
  versions: LibraryVersion[]
  revision: number
  migrated: boolean
}

export interface ReviewPatch {
  paragraphId: string
  text: string
  reviewUpdatedAt: number
}

export interface PushResult {
  ok: boolean
  error?: string
  revision?: number
}

/** 模拟对接失败：下次推送失败一次（失败后自动恢复，重试即可成功） */
let failNextPush = false
export const armLibraryPushFailure = () => { failNextPush = true }

function readReviewDraft(): { paragraphs?: { id: string; text: string }[] } | null {
  try {
    const raw = localStorage.getItem(REVIEW_DRAFT_KEY)
    return raw ? JSON.parse(raw) as { paragraphs?: { id: string; text: string }[] } : null
  } catch {
    return null
  }
}

function writeState(state: LibraryState) {
  localStorage.setItem(LIBRARY_KEY, JSON.stringify(state))
}

/**
 * 旧数据升级：老版本稿库段落没有 attribution 字段，
 * 按两边副本比对补上归属——
 * 已定稿的归稿库；未定稿且与审阅台正文一致的归审阅台，否则归稿库。
 * 同时补齐稿库缺失的段落。
 */
function migrateParagraphs(
  stored: LibraryParagraph[],
  seed: { paragraphId: string; text: string }[],
): { paragraphs: LibraryParagraph[]; migrated: boolean } {
  const reviewText = new Map((readReviewDraft()?.paragraphs ?? []).map((paragraph) => [paragraph.id, paragraph.text]))
  const byId = new Map(stored.map((paragraph) => [paragraph.paragraphId, paragraph]))
  let migrated = false
  const paragraphs: LibraryParagraph[] = seed.map((item) => {
    const existing = byId.get(item.paragraphId)
    if (!existing) {
      migrated = true
      return { paragraphId: item.paragraphId, text: item.text, finalized: false, attribution: 'review' as Attribution, updatedAt: 0 }
    }
    if (!existing.attribution) {
      migrated = true
      const fromReview = !existing.finalized && reviewText.get(item.paragraphId) === existing.text
      return { ...existing, attribution: (fromReview ? 'review' : 'library') as Attribution }
    }
    return existing
  })
  for (const paragraph of stored) {
    if (!seed.some((item) => item.paragraphId === paragraph.paragraphId)) paragraphs.push(paragraph)
  }
  return { paragraphs, migrated }
}

export const libraryApi = {
  /** 首次进入时播种稿库；已存在则读取并升级旧数据 */
  async initialize(seed: { paragraphId: string; text: string }[]): Promise<LibraryState> {
    await wait(120)
    const raw = localStorage.getItem(LIBRARY_KEY)
    if (!raw) {
      const state: LibraryState = {
        paragraphs: seed.map((item) => ({
          paragraphId: item.paragraphId, text: item.text, finalized: false,
          attribution: 'review' as Attribution, updatedAt: 0,
        })),
        versions: [],
        revision: 0,
        migrated: true,
      }
      writeState(state)
      return state
    }
    const parsed = JSON.parse(raw) as Partial<LibraryState>
    const { paragraphs, migrated } = migrateParagraphs(parsed.paragraphs ?? [], seed)
    const state: LibraryState = {
      paragraphs,
      versions: parsed.versions ?? [],
      revision: parsed.revision ?? 0,
      migrated: true,
    }
    if (migrated || !parsed.migrated) writeState(state)
    return state
  },

  /** 查询稿库状态；对接失败时已定稿内容照旧可查 */
  async fetchState(): Promise<LibraryState> {
    await wait(100)
    const raw = localStorage.getItem(LIBRARY_KEY)
    if (!raw) return { paragraphs: [], versions: [], revision: 0, migrated: true }
    return JSON.parse(raw) as LibraryState
  },

  /** 编辑在稿库定稿：稿库版本生效，审阅台之后不得再顶回 */
  async finalizeParagraph(paragraphId: string, text: string): Promise<LibraryState> {
    await wait(200)
    const state = await this.fetchState()
    const now = Date.now()
    state.paragraphs = state.paragraphs.map((paragraph) => paragraph.paragraphId === paragraphId
      ? { ...paragraph, text, finalized: true, finalizedAt: now, attribution: 'library' as Attribution, updatedAt: now }
      : paragraph)
    state.revision += 1
    writeState(state)
    return state
  },

  /** 编辑在稿库发布新版本（仅收录已定稿段落） */
  async publishVersion(label: string): Promise<LibraryState> {
    await wait(200)
    const state = await this.fetchState()
    const version: LibraryVersion = {
      id: `lib-v-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      label,
      createdAt: Date.now(),
      publishedBy: '编辑',
      paragraphIds: state.paragraphs.filter((paragraph) => paragraph.finalized).map((paragraph) => paragraph.paragraphId),
    }
    state.versions = [version, ...state.versions]
    state.revision += 1
    writeState(state)
    return state
  },

  /**
   * 审阅台向稿库推送未定稿段落的改动。
   * 已定稿段落一律不覆盖——稿库不该被审阅台的改动顶回去。
   * 失败时调用方保留本地改动，稍后只补没推上去的段落。
   */
  async pushReviewPatches(patches: ReviewPatch[]): Promise<PushResult> {
    await wait(450)
    if (failNextPush) {
      failNextPush = false
      return { ok: false, error: '稿库对接超时（模拟）：审阅台改动已暂存，可重试' }
    }
    const state = await this.fetchState()
    state.paragraphs = state.paragraphs.map((paragraph) => {
      const patch = patches.find((item) => item.paragraphId === paragraph.paragraphId)
      if (patch && !paragraph.finalized) {
        return { ...paragraph, text: patch.text, attribution: 'review' as Attribution, updatedAt: Math.max(paragraph.updatedAt, patch.reviewUpdatedAt) }
      }
      return paragraph
    })
    state.revision += 1
    writeState(state)
    return { ok: true, revision: state.revision }
  },

  reset() {
    localStorage.removeItem(LIBRARY_KEY)
  },
}
