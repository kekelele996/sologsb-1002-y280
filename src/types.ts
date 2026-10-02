export type Role = 'author' | 'reviewer' | 'editor'
export type ParagraphStatus = 'open' | 'accepted' | 'locked'
export type CommentStatus = 'open' | 'accepted' | 'rejected' | 'merged'
export type CommentType = 'comment' | 'suggestion'

/** 归属侧：审阅台 / 期刊稿库 */
export type Side = 'review' | 'repository'

/** 归属信息：记录一份正文最近由哪一侧写入 */
export interface Attribution {
  side: Side
  updatedAt: number
  note?: string
}

export interface Reply {
  id: string
  author: string
  role: Role
  body: string
  createdAt: number
}

export interface Comment {
  id: string
  paragraphId: string
  author: string
  role: Role
  type: CommentType
  quote: string
  body: string
  suggestion?: string
  status: CommentStatus
  replies: Reply[]
  createdAt: number
  mergedInto?: string
  /** 这条意见最初来自哪一侧（旧数据迁移时补录） */
  origin?: Side
}

export interface Paragraph {
  id: string
  section: string
  number: string
  text: string
  original: string
  status: ParagraphStatus
  highlighted: boolean
  /** 该段是否已在稿库定稿（定稿后以稿库为准） */
  finalized?: boolean
  finalizedAt?: number
  /** 正文归属：最近由哪一侧写入 */
  attribution?: Attribution
}

export interface Version {
  id: string
  label: string
  createdAt: number
  paragraphs: Paragraph[]
}

export interface EditConflict {
  id: string
  paragraphId: string
  localText: string
  remoteText: string
  localAuthor: string
  remoteAuthor: string
  detectedAt: number
}

export interface HistorySnapshot {
  paragraphs: Paragraph[]
  comments: Comment[]
  versions: Version[]
}

/** 稿库侧的一份段落正文 */
export interface RepositoryParagraph {
  id: string
  section: string
  number: string
  text: string
  finalized: boolean
  finalizedAt?: number
  finalizedBy?: string
  attribution: Attribution
}

/** 编辑在稿库出的期刊版本 */
export interface JournalVersion {
  id: string
  label: string
  createdAt: number
  paragraphs: RepositoryParagraph[]
}

/** 期刊稿库快照（审阅台本地缓存的最近一份） */
export interface RepositorySnapshot {
  revision: number
  paragraphs: RepositoryParagraph[]
  comments: Comment[]
  versions: JournalVersion[]
}

/**
 * 待补推标记：只记录“哪一条没上去”，推送时以审阅台当前内容为准。
 * 对接失败后留在审阅台，重试时只补这一侧。
 */
export type OutboxEntry =
  | { kind: 'paragraph'; paragraphId: string; enqueuedAt: number }
  | { kind: 'comment'; commentId: string; enqueuedAt: number }

export interface SyncLogEntry {
  id: string
  at: number
  level: 'info' | 'success' | 'error'
  message: string
}
