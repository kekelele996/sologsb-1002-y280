import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeftOutlined, ArrowRightOutlined, BranchesOutlined, CheckOutlined, CloseOutlined,
  CommentOutlined, DiffOutlined, DeleteOutlined, DisconnectOutlined, FileDoneOutlined, FileProtectOutlined,
  FileTextOutlined, CloudServerOutlined, CloudSyncOutlined, HistoryOutlined, LockOutlined, MenuFoldOutlined,
  MessageOutlined, PlusOutlined, RedoOutlined, SaveOutlined, SendOutlined, SwapOutlined, UndoOutlined,
  UnlockOutlined, UserSwitchOutlined,
} from '@ant-design/icons'
import { Alert, Badge, Button, Card, Checkbox, Collapse, Divider, Drawer, Empty, Input, Modal, Radio, Segmented, Select, Space, Tag, Tooltip, message } from 'antd'
import { submitRemotePatch } from './services/mockApi'
import { useReviewStore } from './store/review'
import type { Comment, CommentType, Paragraph, Role } from './types'

const roleMeta: Record<Role, { label: string; description: string; color: string }> = {
  author: { label: '作者工作区', description: '编辑正文，逐条接受或拒绝修改建议', color: '#2f6f5e' },
  reviewer: { label: '审稿人工作区', description: '引用原文、添加批注与修改建议并参与讨论', color: '#9a5b25' },
  editor: { label: '编辑工作区', description: '合并重复意见、锁定段落、在稿库定稿并出新版本', color: '#5b4d8e' },
}
const roleIcon = (role: Role) => role === 'author' ? <FileDoneOutlined /> : role === 'reviewer' ? <CommentOutlined /> : <BranchesOutlined />
const formatDate = (value: number) => new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })

export default function App() {
  const {
    role, paragraphs, comments, versions, selectedParagraphId, commentFilter, revisionMode, dirty, conflicts,
    repository, outbox, syncStatus, syncError, lastSyncAt, repoOffline, syncLog,
    setRole, selectParagraph, setCommentFilter, setRevisionMode, updateParagraph, addComment, replyComment,
    resolveSuggestion, mergeComment, toggleLock, createVersion, addConflict, resolveConflict, dismissConflict,
    syncWithRepository, retrySync, finalizeParagraph, unfinalizeParagraph, publishJournalVersion, setRepoOffline,
    undo, redo, save, resetDemo,
  } = useReviewStore()
  const [composerOpen, setComposerOpen] = useState(false)
  const [commentType, setCommentType] = useState<CommentType>('comment')
  const [commentBody, setCommentBody] = useState('')
  const [suggestion, setSuggestion] = useState('')
  const [quote, setQuote] = useState('')
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({})
  const [versionOpen, setVersionOpen] = useState(false)
  const [versionA, setVersionA] = useState(versions[1]?.id ?? versions[0]?.id)
  const [versionB, setVersionB] = useState(versions[0]?.id)
  const [versionLabel, setVersionLabel] = useState('')
  const [repoOpen, setRepoOpen] = useState(false)

  const selected = paragraphs.find((paragraph) => paragraph.id === selectedParagraphId) ?? paragraphs[0]
  const sections = useMemo(() => Array.from(new Set(paragraphs.map((paragraph) => paragraph.section))), [paragraphs])
  const paragraphCommentCounts = useMemo(() => comments.reduce<Record<string, number>>((acc, comment) => {
    acc[comment.paragraphId] = (acc[comment.paragraphId] ?? 0) + 1
    return acc
  }, {}), [comments])
  const duplicateParagraphIds = useMemo(() => new Set(Object.entries(paragraphCommentCounts).filter(([, count]) => count > 1).map(([id]) => id)), [paragraphCommentCounts])
  const visibleComments = useMemo(() => comments.filter((comment) => {
    if (commentFilter === 'open') return comment.status === 'open'
    if (commentFilter === 'suggestion') return comment.type === 'suggestion' && comment.status === 'open'
    if (commentFilter === 'duplicate') return duplicateParagraphIds.has(comment.paragraphId) && comment.status === 'open'
    return true
  }).sort((a, b) => b.createdAt - a.createdAt), [commentFilter, comments, duplicateParagraphIds])

  const syncMeta = useMemo(() => {
    if (syncStatus === 'syncing') return { color: 'processing', text: '对接中…' }
    if (syncStatus === 'error') return { color: 'error', text: outbox.length ? `对接失败 · 待补推 ${outbox.length} 项` : '对接失败' }
    if (outbox.length > 0) return { color: 'gold', text: `待对接 ${outbox.length} 项` }
    if (lastSyncAt) return { color: 'success', text: `已对接 ${formatDate(lastSyncAt)}` }
    return { color: 'default', text: '未对接' }
  }, [syncStatus, outbox.length, lastSyncAt])

  useEffect(() => {
    void useReviewStore.getState().syncWithRepository()
  }, [])

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [dirty])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable) return
      const state = useReviewStore.getState()
      const index = state.paragraphs.findIndex((paragraph) => paragraph.id === state.selectedParagraphId)
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        event.shiftKey ? state.redo() : state.undo()
      } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'y') {
        event.preventDefault(); state.redo()
      } else if (event.key.toLowerCase() === 'j') {
        event.preventDefault(); const next = state.paragraphs[Math.min(state.paragraphs.length - 1, index + 1)]; if (next) state.selectParagraph(next.id)
      } else if (event.key.toLowerCase() === 'k') {
        event.preventDefault(); const previous = state.paragraphs[Math.max(0, index - 1)]; if (previous) state.selectParagraph(previous.id)
      } else if (event.key.toLowerCase() === 't') {
        event.preventDefault(); state.setRevisionMode(!state.revisionMode)
      } else if (event.key.toLowerCase() === 'l' && state.role === 'editor') {
        event.preventDefault(); state.toggleLock(state.selectedParagraphId)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const scrollToParagraph = (id: string) => {
    selectParagraph(id)
    document.getElementById(`paragraph-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
  const openComposer = (type: CommentType) => {
    const selectedText = window.getSelection()?.toString().trim()
    setQuote(selectedText && selected?.text.includes(selectedText) ? selectedText : selected?.text.slice(0, 64) ?? '')
    setSuggestion(type === 'suggestion' ? selected?.text ?? '' : '')
    setCommentType(type)
    setComposerOpen(true)
  }
  const submitComment = () => {
    if (!selected || !commentBody.trim()) { message.warning('请填写批注内容'); return }
    addComment({ paragraphId: selected.id, type: commentType, quote, body: commentBody.trim(), suggestion: commentType === 'suggestion' ? suggestion : undefined })
    setCommentBody(''); setSuggestion(''); setQuote(''); setComposerOpen(false)
    message.success(commentType === 'suggestion' ? '修改建议已提交' : '段落批注已添加')
  }
  const handleMockConflict = async () => {
    if (!selected) return
    const response = await submitRemotePatch(selected)
    addConflict({
      id: `conflict-${Date.now()}`, paragraphId: selected.id, localText: selected.text, remoteText: response.remoteText,
      localAuthor: roleMeta[role].label, remoteAuthor: response.remoteAuthor, detectedAt: Date.now(),
    })
    message.warning('模拟接口返回了同段落的远端修改，请处理冲突')
  }
  const handleCreateVersion = () => {
    if (versionLabel.trim()) createVersion(versionLabel.trim())
    else createVersion('')
    setVersionLabel('')
    message.success('当前版本已保存')
  }
  const handleSync = async () => {
    const state = useReviewStore.getState()
    if (state.syncStatus === 'error' && state.outbox.length > 0) await retrySync()
    else await syncWithRepository()
    const after = useReviewStore.getState()
    if (after.syncStatus === 'error') message.warning(after.syncError ?? '对接失败，改动已留在审阅台等待重试')
    else message.success('与期刊稿库对接完成')
  }
  const handleFinalize = async (paragraph: Paragraph) => {
    const ok = paragraph.finalized ? await unfinalizeParagraph(paragraph.id) : await finalizeParagraph(paragraph.id)
    if (!ok) { message.error('稿库连接失败，操作未生效'); return }
    message.success(paragraph.finalized ? '已取消定稿，此后该段以审阅台为准' : '已在稿库定稿，此后该段以稿库为准')
  }
  const handlePublishJournal = async () => {
    const ok = await publishJournalVersion(versionLabel.trim())
    if (!ok) { message.error('稿库连接失败，版本未发布'); return }
    setVersionLabel('')
    message.success('稿库新版本已发布')
  }
  const comparedA = versions.find((version) => version.id === versionA)
  const comparedB = versions.find((version) => version.id === versionB)
  const comparedRows = comparedA && comparedB ? comparedA.paragraphs.map((paragraph, index) => ({ a: paragraph, b: comparedB.paragraphs[index] })) : []

  return (
    <div className="review-app">
      <header className="app-header">
        <div className="paper-identity">
          <div className="paper-mark">CR</div>
          <div><h1>学术论文协作审阅台</h1><p>Collaborative Research Review · MS-2026-0417</p></div>
        </div>
        <div className="role-switch">
          <Segmented block value={role} onChange={(value) => setRole(value as Role)} options={(Object.keys(roleMeta) as Role[]).map((item) => ({ label: <span>{roleIcon(item)} {roleMeta[item].label.replace('工作区', '')}</span>, value: item }))} />
        </div>
        <Space>
          <Badge dot={dirty}><Button icon={<SaveOutlined />} onClick={() => { save(); message.success('草稿已保存到浏览器') }}>保存</Button></Badge>
          <Button icon={<UndoOutlined />} disabled={!useReviewStore.getState().past.length} onClick={undo} />
          <Button icon={<RedoOutlined />} disabled={!useReviewStore.getState().future.length} onClick={redo} />
          <Button danger={conflicts.length > 0} icon={<SwapOutlined />} onClick={() => void handleMockConflict()}>模拟冲突</Button>
          <Divider type="vertical" />
          <Tooltip title={syncError || '审阅台与期刊稿库各存一份正文，点击进行双向对接'}>
            <Tag className="sync-status" color={syncMeta.color}>{syncMeta.text}</Tag>
          </Tooltip>
          <Button icon={<CloudSyncOutlined />} loading={syncStatus === 'syncing'} onClick={() => void handleSync()}>
            {syncStatus === 'error' && outbox.length > 0 ? `重试补推 ${outbox.length} 项` : '对接稿库'}
          </Button>
          <Tooltip title={repoOffline ? '恢复稿库连接' : '模拟稿库断连：写入失败，已定稿内容照旧可查'}>
            <Button icon={<DisconnectOutlined />} danger={repoOffline} type={repoOffline ? 'primary' : 'default'} onClick={() => setRepoOffline(!repoOffline)} />
          </Tooltip>
          <Button icon={<CloudServerOutlined />} onClick={() => setRepoOpen(true)}>稿库</Button>
        </Space>
      </header>

      <div className="role-banner" style={{ '--role-color': roleMeta[role].color } as React.CSSProperties}>
        <span className="role-badge">{roleIcon(role)} {roleMeta[role].label}</span>
        <span>{roleMeta[role].description}</span>
        <span className="paper-state"><FileTextOutlined /> 论文正文 v2.4 · 已定稿以稿库为准，未定稿以审阅台为准</span>
      </div>

      {conflicts.length > 0 && (
        <div className="conflict-stack">
          {conflicts.map((conflict) => (
            <Alert
              key={conflict.id} type="error" showIcon message={`段落冲突：${conflict.localAuthor} 与 ${conflict.remoteAuthor} 同时修改`}
              description={(
                <div className="conflict-content">
                  <div><b>本页版本</b><p>{conflict.localText}</p></div>
                  <div><b>模拟远端版本</b><p>{conflict.remoteText}</p></div>
                  <Space><Button size="small" onClick={() => resolveConflict(conflict.id, 'local')}>保留本页</Button><Button size="small" type="primary" onClick={() => resolveConflict(conflict.id, 'remote')}>采用远端</Button><Button size="small" type="text" onClick={() => dismissConflict(conflict.id)}>稍后处理</Button></Space>
                </div>
              )}
            />
          ))}
        </div>
      )}

      <main className="workspace">
        <aside className="toc-panel">
          <div className="panel-title"><MenuFoldOutlined /> 侧边目录</div>
          <nav>
            {sections.map((section) => (
              <div key={section} className="toc-section">
                <strong>{section}</strong>
                {paragraphs.filter((paragraph) => paragraph.section === section).map((paragraph) => (
                  <button key={paragraph.id} className={paragraph.id === selected?.id ? 'active' : ''} onClick={() => scrollToParagraph(paragraph.id)}>
                    <span>{paragraph.number}</span>
                    <span>{paragraph.text.slice(0, 24)}…</span>
                    {paragraph.finalized && <FileProtectOutlined />}
                    {!paragraph.finalized && paragraph.status === 'locked' && <LockOutlined />}
                    {!!paragraphCommentCounts[paragraph.id] && <Badge count={paragraphCommentCounts[paragraph.id]} size="small" />}
                  </button>
                ))}
              </div>
            ))}
          </nav>
          <div className="version-box">
            <div className="panel-title"><HistoryOutlined /> 版本</div>
            <Input value={versionLabel} onChange={(event) => setVersionLabel(event.target.value)} placeholder="新版本名称" onPressEnter={handleCreateVersion} />
            <Button block icon={<PlusOutlined />} onClick={handleCreateVersion}>保存当前版本</Button>
            <Button block icon={<DiffOutlined />} onClick={() => setVersionOpen(true)}>比较两个版本</Button>
            {role === 'editor' && (
              <Tooltip title="把当前稿库正文快照为新期刊版本">
                <Button block type="primary" ghost icon={<CloudServerOutlined />} onClick={() => void handlePublishJournal()}>出稿库新版本</Button>
              </Tooltip>
            )}
          </div>
        </aside>

        <section className="document-panel">
          <div className="document-toolbar">
            <div><h2>大语言模型辅助下的开源维护协作研究</h2><p>作者：林晓、陈默、王远 · 最近保存 {formatDate(Date.now())}</p></div>
            <Space>
              <Checkbox checked={revisionMode} onChange={(event) => setRevisionMode(event.target.checked)}>修订模式</Checkbox>
              <Tag color={dirty ? 'gold' : 'green'}>{dirty ? '有未保存修改' : '已保存'}</Tag>
            </Space>
          </div>

          <div className="paper-sheet">
            <div className="paper-kicker">RESEARCH ARTICLE · CONFIDENTIAL REVIEW</div>
            {sections.map((section) => (
              <section key={section} className="paper-section">
                <h3>{section}</h3>
                {paragraphs.filter((paragraph) => paragraph.section === section).map((paragraph) => (
                  <article
                    id={`paragraph-${paragraph.id}`} key={paragraph.id} onMouseUp={() => setQuote(window.getSelection()?.toString().trim() ?? '')}
                    className={`paragraph-card ${paragraph.id === selected?.id ? 'selected' : ''} ${paragraph.highlighted ? 'highlighted' : ''} ${paragraph.status === 'locked' ? 'locked' : ''} ${paragraph.finalized ? 'finalized' : ''}`}
                    onClick={() => selectParagraph(paragraph.id)}
                  >
                    <div className="paragraph-meta">
                      <span className="paragraph-no">{paragraph.number}</span>
                      <span>段落 {paragraph.number.replace('.', '')}</span>
                      {paragraph.finalized && <Tag icon={<FileProtectOutlined />} color="geekblue">已定稿 · 以稿库为准</Tag>}
                      {!paragraph.finalized && paragraph.status === 'locked' && <Tag icon={<LockOutlined />} color="purple">已锁定</Tag>}
                      {!paragraph.finalized && paragraph.status === 'accepted' && <Tag icon={<CheckOutlined />} color="green">已确认</Tag>}
                      {!!paragraphCommentCounts[paragraph.id] && <Tag icon={<MessageOutlined />}>{paragraphCommentCounts[paragraph.id]} 条意见</Tag>}
                      {paragraph.attribution && (
                        <Tooltip title={`${paragraph.attribution.note ? `${paragraph.attribution.note} · ` : ''}${formatDate(paragraph.attribution.updatedAt)}`}>
                          <span className="attribution-tag">归属 {paragraph.attribution.side === 'repository' ? '稿库' : '审阅台'}</span>
                        </Tooltip>
                      )}
                    </div>
                    {revisionMode ? (
                      <div className="revision-grid">
                        <div><small>原稿</small><p>{paragraph.original}</p></div>
                        <div><small>当前修订</small><p>{paragraph.text}</p></div>
                      </div>
                    ) : role === 'author' ? (
                      <Input.TextArea autoSize={{ minRows: 2, maxRows: 8 }} value={paragraph.text} readOnly={paragraph.status === 'locked' || paragraph.finalized} onChange={(event) => updateParagraph(paragraph.id, event.target.value)} />
                    ) : (
                      <p className="paragraph-text">{paragraph.text}</p>
                    )}
                    <div className="paragraph-actions">
                      {role === 'reviewer' && <><Button size="small" icon={<CommentOutlined />} onClick={(event) => { event.stopPropagation(); selectParagraph(paragraph.id); openComposer('comment') }}>添加批注</Button><Button size="small" icon={<FileDoneOutlined />} onClick={(event) => { event.stopPropagation(); selectParagraph(paragraph.id); openComposer('suggestion') }}>提出建议</Button></>}
                      {role === 'editor' && <Button size="small" icon={paragraph.status === 'locked' ? <UnlockOutlined /> : <LockOutlined />} onClick={(event) => { event.stopPropagation(); toggleLock(paragraph.id) }}>{paragraph.status === 'locked' ? '解除锁定' : '锁定段落'}</Button>}
                      {role === 'editor' && (
                        <Button size="small" type={paragraph.finalized ? 'default' : 'primary'} ghost={!paragraph.finalized} icon={<FileProtectOutlined />} onClick={(event) => { event.stopPropagation(); void handleFinalize(paragraph) }}>
                          {paragraph.finalized ? '取消定稿' : '定稿到稿库'}
                        </Button>
                      )}
                      {role === 'author' && <span className="author-tip">{paragraph.finalized ? '该段已在稿库定稿，以稿库为准' : '可直接修改正文，右侧逐条处理建议'}</span>}
                    </div>
                  </article>
                ))}
              </section>
            ))}
          </div>
        </section>

        <aside className="comments-panel">
          <div className="comments-header">
            <div><h2><CommentOutlined /> 审阅意见 <Badge count={comments.filter((comment) => comment.status === 'open').length} /></h2><p>引用原文、讨论与修订建议</p></div>
          </div>
          <div className="comment-filters">
            <Radio.Group value={commentFilter} onChange={(event) => setCommentFilter(event.target.value)} buttonStyle="solid" size="small">
              <Radio.Button value="all">全部</Radio.Button><Radio.Button value="open">待处理</Radio.Button><Radio.Button value="suggestion">建议</Radio.Button><Radio.Button value="duplicate">重复</Radio.Button>
            </Radio.Group>
          </div>
          <div className="comment-list">
            {visibleComments.map((comment) => {
              const paragraph = paragraphs.find((item) => item.id === comment.paragraphId)
              return (
                <Card key={comment.id} size="small" className={`comment-card ${comment.status}`} title={<span>{comment.author} <Tag>{comment.type === 'suggestion' ? '修改建议' : '段落批注'}</Tag>{comment.origin === 'repository' && <Tag color="geekblue">来自稿库</Tag>}</span>} extra={<small>{formatDate(comment.createdAt)}</small>}>
                  <button className="quote-line" onClick={() => paragraph && scrollToParagraph(paragraph.id)}>“{comment.quote}” · 段落 {paragraph?.number}</button>
                  <p className="comment-body">{comment.body}</p>
                  {comment.suggestion && <div className="suggestion-box"><small>建议改为</small><p>{comment.suggestion}</p></div>}
                  {comment.status !== 'open' && <Tag color={comment.status === 'accepted' ? 'green' : comment.status === 'rejected' ? 'red' : 'blue'}>{comment.status === 'accepted' ? '已接受' : comment.status === 'rejected' ? '已拒绝' : '已合并'}</Tag>}
                  <div className="replies">
                    {comment.replies.map((reply) => <div key={reply.id} className="reply"><b>{reply.author}</b><span>{reply.body}</span></div>)}
                  </div>
                  <div className="reply-box">
                    <Input size="small" value={replyDrafts[comment.id] ?? ''} onChange={(event) => setReplyDrafts((drafts) => ({ ...drafts, [comment.id]: event.target.value }))} placeholder="回复讨论…" onPressEnter={() => { const body = replyDrafts[comment.id]?.trim(); if (body) { replyComment(comment.id, body); setReplyDrafts((drafts) => ({ ...drafts, [comment.id]: '' })) } }} />
                    <Button size="small" type="text" icon={<SendOutlined />} onClick={() => { const body = replyDrafts[comment.id]?.trim(); if (body) { replyComment(comment.id, body); setReplyDrafts((drafts) => ({ ...drafts, [comment.id]: '' })) } }} />
                  </div>
                  {comment.status === 'open' && role === 'author' && comment.type === 'suggestion' && !paragraph?.finalized && <div className="decision-row"><Button type="primary" size="small" icon={<CheckOutlined />} onClick={() => resolveSuggestion(comment.id, true)}>接受修改</Button><Button danger size="small" icon={<CloseOutlined />} onClick={() => resolveSuggestion(comment.id, false)}>拒绝</Button></div>}
                  {comment.status === 'open' && role === 'editor' && duplicateParagraphIds.has(comment.paragraphId) && (() => {
                    const sibling = comments.find((item) => item.id !== comment.id && item.paragraphId === comment.paragraphId && item.status === 'open')
                    return sibling ? <Button size="small" type="dashed" icon={<BranchesOutlined />} onClick={() => mergeComment(comment.id, sibling.id)}>合并到“{sibling.author}”意见</Button> : null
                  })()}
                </Card>
              )
            })}
            {!visibleComments.length && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前筛选下没有意见" />}
          </div>
          <div className="keyboard-hint"><span><kbd>J</kbd>/<kbd>K</kbd> 段落导航</span><span><kbd>T</kbd> 修订模式</span>{role === 'editor' && <span><kbd>L</kbd> 锁定</span>}<span><kbd>⌘Z</kbd> 撤销</span></div>
        </aside>
      </main>

      <Modal title={commentType === 'suggestion' ? '提出修改建议' : '添加段落批注'} open={composerOpen} onCancel={() => setComposerOpen(false)} onOk={submitComment} okText="提交" width={620}>
        <div className="composer">
          <label>引用原文</label>
          <Input.TextArea value={quote} onChange={(event) => setQuote(event.target.value)} autoSize={{ minRows: 2, maxRows: 4 }} />
          <label>{commentType === 'suggestion' ? '建议改为' : '批注内容'}</label>
          {commentType === 'suggestion' && <Input.TextArea value={suggestion} onChange={(event) => setSuggestion(event.target.value)} autoSize={{ minRows: 3, maxRows: 7 }} />}
          <label>说明</label>
          <Input.TextArea value={commentBody} onChange={(event) => setCommentBody(event.target.value)} placeholder="说明修改理由或希望作者关注的问题" autoSize={{ minRows: 2, maxRows: 5 }} />
        </div>
      </Modal>

      <Modal title="版本比较" open={versionOpen} onCancel={() => setVersionOpen(false)} footer={null} width={980}>
        <div className="compare-selectors">
          <Select value={versionA} onChange={setVersionA} options={versions.map((version) => ({ label: `${version.label} · ${formatDate(version.createdAt)}`, value: version.id }))} />
          <ArrowRightOutlined />
          <Select value={versionB} onChange={setVersionB} options={versions.map((version) => ({ label: `${version.label} · ${formatDate(version.createdAt)}`, value: version.id }))} />
        </div>
        <div className="version-table">
          <div className="version-head"><b>{comparedA?.label ?? '版本 A'}</b><b>{comparedB?.label ?? '版本 B'}</b></div>
          {comparedRows.map(({ a, b }) => (
            <div key={a.id} className={`version-row ${a.text !== b?.text ? 'changed' : ''}`}>
              <div><span>{a.number}</span>{a.text}</div><div><span>{b?.number ?? '—'}</span>{b?.text ?? '段落已删除'}</div>
            </div>
          ))}
        </div>
      </Modal>

      <Drawer title={<span><CloudServerOutlined /> 期刊稿库</span>} placement="right" width={560} open={repoOpen} onClose={() => setRepoOpen(false)}>
        {repoOffline && <Alert style={{ marginBottom: 12 }} type="warning" showIcon message="稿库连接已断开（模拟）" description="展示审阅台缓存的最近快照：已定稿内容照旧可查，未上去的改动留在审阅台等待重试。" />}
        <Alert style={{ marginBottom: 16 }} type="info" showIcon message="对接规则" description="审阅台与稿库各存一份正文：已定稿段落以稿库为准，未定稿段落以审阅台为准；批注与建议并集合并、互不抹掉；稿库已定稿内容不被审阅台改动顶回。" />
        {outbox.length > 0 && (
          <Alert
            style={{ marginBottom: 16 }} type="warning" showIcon message={`${outbox.length} 项改动未推送到稿库`}
            description={(
              <div>
                <div className="outbox-list">
                  {outbox.map((entry) => (
                    <Tag key={`${entry.kind}-${entry.kind === 'paragraph' ? entry.paragraphId : entry.commentId}`}>
                      {entry.kind === 'paragraph' ? `段落 ${paragraphs.find((item) => item.id === entry.paragraphId)?.number ?? entry.paragraphId}` : `意见 ${comments.find((item) => item.id === entry.commentId)?.quote?.slice(0, 12) || entry.commentId}`}
                    </Tag>
                  ))}
                </div>
                <Button size="small" type="primary" style={{ marginTop: 8 }} loading={syncStatus === 'syncing'} onClick={() => void retrySync().then(() => message.info('补推结束'))}>重试补推（只补稿库一侧）</Button>
              </div>
            )}
          />
        )}
        <div className="repo-section">
          <div className="panel-title"><FileTextOutlined /> 稿库正文 {repository && <span className="repo-revision">rev {repository.revision}</span>}</div>
          {!repository && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="尚未获取稿库快照" />}
          <div className="repo-list">
            {repository?.paragraphs.map((paragraph) => (
              <div key={paragraph.id} className={`repo-paragraph ${paragraph.finalized ? 'finalized' : ''}`}>
                <div className="repo-paragraph-meta">
                  <b>{paragraph.number}</b>
                  {paragraph.finalized
                    ? <Tag icon={<FileProtectOutlined />} color="geekblue">已定稿{paragraph.finalizedBy ? ` · ${paragraph.finalizedBy}` : ''}</Tag>
                    : <Tag>未定稿 · 以审阅台为准</Tag>}
                  <span className="repo-attribution">归属 {paragraph.attribution.side === 'repository' ? '稿库' : '审阅台'} · {formatDate(paragraph.attribution.updatedAt)}{paragraph.attribution.note ? ` · ${paragraph.attribution.note}` : ''}</span>
                </div>
                <p>{paragraph.text}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="repo-section">
          <div className="panel-title"><HistoryOutlined /> 稿库版本（编辑发布）</div>
          {!repository?.versions.length && <p className="repo-empty">编辑尚未在稿库出新版本</p>}
          <Collapse
            size="small"
            items={repository?.versions.map((version) => ({
              key: version.id,
              label: `${version.label} · ${formatDate(version.createdAt)} · ${version.paragraphs.filter((item) => item.finalized).length}/${version.paragraphs.length} 段已定稿`,
              children: (
                <div className="repo-list">
                  {version.paragraphs.map((paragraph) => (
                    <div key={paragraph.id} className={`repo-paragraph ${paragraph.finalized ? 'finalized' : ''}`}>
                      <div className="repo-paragraph-meta"><b>{paragraph.number}</b>{paragraph.finalized ? <Tag color="geekblue">已定稿</Tag> : <Tag>未定稿</Tag>}</div>
                      <p>{paragraph.text}</p>
                    </div>
                  ))}
                </div>
              ),
            })) ?? []}
          />
        </div>
        <div className="repo-section">
          <div className="panel-title"><CommentOutlined /> 稿库已收意见 {repository ? `${repository.comments.length} 条` : ''}</div>
          <p className="repo-empty">审阅台的批注与建议对接后汇入稿库；本地意见在审阅台原样保留，互不顺手抹掉。</p>
        </div>
        <div className="repo-section">
          <div className="panel-title"><UserSwitchOutlined /> 对接日志</div>
          <div className="sync-log">
            {syncLog.map((entry) => (
              <div key={entry.id} className={`sync-log-entry ${entry.level}`}>
                <span>{formatDate(entry.at)}</span>
                <p>{entry.message}</p>
              </div>
            ))}
            {!syncLog.length && <p className="repo-empty">暂无对接记录</p>}
          </div>
        </div>
      </Drawer>

      <footer className="app-footer">
        <span>本地草稿自动持久化 · 期刊稿库双向对接：已定稿以稿库为准，未定稿以审阅台为准，失败留待重试</span>
        <Button type="text" size="small" icon={<DeleteOutlined />} onClick={() => { resetDemo(); message.success('已重置示例数据') }}>重置示例</Button>
      </footer>
    </div>
  )
}
