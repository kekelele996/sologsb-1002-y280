export type Role = 'author' | 'reviewer' | 'editor'
export type ParagraphStatus = 'open' | 'accepted' | 'locked'
export type CommentStatus = 'open' | 'accepted' | 'rejected' | 'merged'
export type CommentType = 'comment' | 'suggestion'
export type Attribution = 'review' | 'library'
export type SyncPhase = 'idle' | 'syncing' | 'success' | 'failed'

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
}

export interface Paragraph {
  id: string
  section: string
  number: string
  text: string
  original: string
  status: ParagraphStatus
  highlighted: boolean
  /** 稿库是否已定稿 */
  finalized: boolean
  finalizedAt?: number
  /** 当前正文归属：审阅台改动 还是 稿库定稿 */
  attribution: Attribution
  /** 审阅台最后修改时间（用于判断是否有待推送改动） */
  reviewUpdatedAt: number
  /** 稿库最后修改时间 */
  libraryUpdatedAt?: number
  /** 最近一次成功同步时间；早于 reviewUpdatedAt 说明有改动没推上去 */
  syncedAt?: number
}

/** 稿库中的段落副本 */
export interface LibraryParagraph {
  paragraphId: string
  text: string
  finalized: boolean
  attribution: Attribution
  updatedAt: number
  finalizedAt?: number
}

/** 稿库发布的新版本 */
export interface LibraryVersion {
  id: string
  label: string
  createdAt: number
  publishedBy: string
  paragraphIds: string[]
}

/** 审阅台保存的版本快照 */
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

/** 同步过程中给用户的提示（定稿以稿库为准、批注保留等） */
export interface SyncNotice {
  id: string
  type: 'info' | 'warning' | 'error'
  message: string
  createdAt: number
}

export interface HistorySnapshot {
  paragraphs: Paragraph[]
  comments: Comment[]
  versions: Version[]
}
