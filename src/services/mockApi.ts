import type { Comment, JournalVersion, Paragraph, RepositoryParagraph, RepositorySnapshot } from '../types'

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds))
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T

export interface RemotePatch {
  accepted: boolean
  paragraphId: string
  remoteText: string
  remoteAuthor: string
  serverRevision: number
}

export const submitRemotePatch = async (paragraph: Paragraph): Promise<RemotePatch> => {
  await wait(650)
  const remoteText = paragraph.text.includes('然而')
    ? paragraph.text.replace('然而', '但是')
    : `${paragraph.text.replace(/。$/, '')}。作者补充：该结论仅适用于本次样本。`
  return {
    accepted: true,
    paragraphId: paragraph.id,
    remoteText,
    remoteAuthor: '协作者 · 王教授',
    serverRevision: Math.floor(Date.now() / 1000),
  }
}

/* ------------------------------------------------------------------ */
/* 期刊稿库（模拟远端服务，独立存储，与审阅台各存一份正文）                */
/* ------------------------------------------------------------------ */

const REPO_KEY = 'sologsb-1002-repository-v1'
const id = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`

let repositoryOnline = true
/** 模拟稿库断连：写入与拉取会失败，本地缓存快照仍可查询 */
export const setRepositoryOnline = (online: boolean) => { repositoryOnline = online }
export const isRepositoryOnline = () => repositoryOnline

const readRepository = (): RepositorySnapshot | null => {
  const raw = localStorage.getItem(REPO_KEY)
  return raw ? JSON.parse(raw) as RepositorySnapshot : null
}
const writeRepository = (snapshot: RepositorySnapshot) => {
  localStorage.setItem(REPO_KEY, JSON.stringify(snapshot))
}

/** 由审阅台段落生成稿库副本；旧数据没有归属时按两侧规则补录 */
const toRepositoryParagraph = (paragraph: Paragraph): RepositoryParagraph => {
  const finalized = paragraph.finalized ?? paragraph.status !== 'open'
  return {
    id: paragraph.id,
    section: paragraph.section,
    number: paragraph.number,
    text: paragraph.text,
    finalized,
    finalizedAt: finalized ? paragraph.finalizedAt ?? Date.now() : undefined,
    finalizedBy: finalized ? '编辑' : undefined,
    attribution: paragraph.attribution ?? {
      side: finalized ? 'repository' : 'review',
      updatedAt: Date.now(),
      note: '旧数据迁移补录',
    },
  }
}

/** 首次对接时以审阅台正文为种子建库；已建库则直接返回 */
export const ensureRepository = (seedParagraphs: Paragraph[], seedComments: Comment[]): RepositorySnapshot => {
  const existing = readRepository()
  if (existing) return existing
  const snapshot: RepositorySnapshot = {
    revision: 1,
    paragraphs: seedParagraphs.map(toRepositoryParagraph),
    comments: clone(seedComments),
    versions: [],
  }
  writeRepository(snapshot)
  return snapshot
}

export const resetRepository = () => { localStorage.removeItem(REPO_KEY) }

/** 拉取稿库快照；断连时抛错，调用方改用本地缓存快照（已定稿内容照旧能查） */
export const fetchRepository = async (): Promise<RepositorySnapshot> => {
  await wait(320)
  if (!repositoryOnline) throw new Error('无法连接期刊稿库')
  const snapshot = readRepository()
  if (!snapshot) throw new Error('期刊稿库尚未初始化')
  return clone(snapshot)
}

export interface ParagraphPush {
  paragraphId: string
  section: string
  number: string
  text: string
  updatedAt: number
}

/**
 * 审阅台 → 稿库补推正文。已定稿段落受保护：
 * 审阅台的改动顶不回去，会被跳过并返回 skipped。
 */
export const pushParagraphsToRepository = async (updates: ParagraphPush[]): Promise<{ snapshot: RepositorySnapshot; skipped: string[] }> => {
  await wait(420)
  if (!repositoryOnline) throw new Error('无法连接期刊稿库，段落未推送')
  const repo = readRepository()
  if (!repo) throw new Error('期刊稿库尚未初始化')
  const skipped: string[] = []
  for (const update of updates) {
    const target = repo.paragraphs.find((item) => item.id === update.paragraphId)
    if (target?.finalized) { skipped.push(update.paragraphId); continue }
    if (target) {
      target.text = update.text
      target.attribution = { side: 'review', updatedAt: update.updatedAt }
    } else {
      repo.paragraphs.push({
        id: update.paragraphId,
        section: update.section,
        number: update.number,
        text: update.text,
        finalized: false,
        attribution: { side: 'review', updatedAt: update.updatedAt },
      })
    }
  }
  repo.revision += 1
  writeRepository(repo)
  return { snapshot: clone(repo), skipped }
}

/** 审阅台 → 稿库补推意见：按 id 覆盖更新，稿库已有的意见不会被删除 */
export const pushCommentsToRepository = async (comments: Comment[]): Promise<{ snapshot: RepositorySnapshot }> => {
  await wait(420)
  if (!repositoryOnline) throw new Error('无法连接期刊稿库，意见未推送')
  const repo = readRepository()
  if (!repo) throw new Error('期刊稿库尚未初始化')
  for (const comment of comments) {
    const index = repo.comments.findIndex((item) => item.id === comment.id)
    if (index >= 0) repo.comments[index] = clone(comment)
    else repo.comments.push(clone(comment))
  }
  repo.revision += 1
  writeRepository(repo)
  return { snapshot: clone(repo) }
}

/** 编辑在稿库把段落定稿：此后该段以稿库为准 */
export const finalizeInRepository = async (paragraphId: string, text: string, editor: string): Promise<RepositorySnapshot> => {
  await wait(380)
  if (!repositoryOnline) throw new Error('无法连接期刊稿库，定稿未生效')
  const repo = readRepository()
  if (!repo) throw new Error('期刊稿库尚未初始化')
  const target = repo.paragraphs.find((item) => item.id === paragraphId)
  if (!target) throw new Error('稿库中不存在该段落')
  target.text = text
  target.finalized = true
  target.finalizedAt = Date.now()
  target.finalizedBy = editor
  target.attribution = { side: 'repository', updatedAt: Date.now() }
  repo.revision += 1
  writeRepository(repo)
  return clone(repo)
}

/** 编辑在稿库取消定稿：之后该段重新以审阅台为准 */
export const unfinalizeInRepository = async (paragraphId: string): Promise<RepositorySnapshot> => {
  await wait(380)
  if (!repositoryOnline) throw new Error('无法连接期刊稿库，操作未生效')
  const repo = readRepository()
  if (!repo) throw new Error('期刊稿库尚未初始化')
  const target = repo.paragraphs.find((item) => item.id === paragraphId)
  if (!target) throw new Error('稿库中不存在该段落')
  target.finalized = false
  target.finalizedAt = undefined
  target.finalizedBy = undefined
  target.attribution = { side: 'repository', updatedAt: Date.now() }
  repo.revision += 1
  writeRepository(repo)
  return clone(repo)
}

/** 编辑在稿库出新版本：快照当前稿库正文 */
export const publishVersionInRepository = async (label: string): Promise<{ snapshot: RepositorySnapshot; version: JournalVersion }> => {
  await wait(450)
  if (!repositoryOnline) throw new Error('无法连接期刊稿库，版本未发布')
  const repo = readRepository()
  if (!repo) throw new Error('期刊稿库尚未初始化')
  const version: JournalVersion = {
    id: id('journal'),
    label: label.trim() || `稿库版本 ${repo.versions.length + 1}`,
    createdAt: Date.now(),
    paragraphs: clone(repo.paragraphs),
  }
  repo.versions.unshift(version)
  repo.revision += 1
  writeRepository(repo)
  return { snapshot: clone(repo), version: clone(version) }
}
