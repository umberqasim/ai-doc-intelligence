import { useState, useEffect } from 'react'
import { authAPI, documentsAPI, aiAPI, adminAPI } from '../services/api'
import toast from 'react-hot-toast'
import {
  Brain, Upload, MessageSquare, FileText,
  BarChart2, LogOut, Trash2, Loader,
  Zap, TrendingUp, File, CheckCircle,
  Clock, AlertCircle, ArrowRight, View,
  ChevronRight, Sparkles, Bot, Pencil, Menu, X, ScanText
} from 'lucide-react'
import ChatPanel from '../components/ChatPanel'
import AIPanel from '../components/AIPanel'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'
import { Shield } from 'lucide-react'

export default function Dashboard({ onLogout }) {
  const [user, setUser] = useState(null)
  const [documents, setDocuments] = useState([])
  const [stats, setStats] = useState(null)
  const [selectedDoc, setSelectedDoc] = useState(null)
  const [activeTab, setActiveTab] = useState('documents')
  const [uploading, setUploading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [docsPanelOpen, setDocsPanelOpen] = useState(true)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [isEditingName, setIsEditingName] = useState(false)
  const [editNameValue, setEditNameValue] = useState('')
  const [editingCategory, setEditingCategory] = useState(false)
  const [adminUsers, setAdminUsers] = useState([])
  const [adminLoading, setAdminLoading] = useState(false)

  useEffect(() => { loadData() }, [])

  // Poll for status updates while any document is still pending/processing
  useEffect(() => {
    const hasPendingDocs = documents.some(d => d.status === 'pending' || d.status === 'processing')
    if (!hasPendingDocs) return

    const interval = setInterval(async () => {
      try {
        const [docsRes, statsRes] = await Promise.all([
          documentsAPI.list(),
          aiAPI.dashboard()
        ])
        setDocuments(docsRes.data.documents)
        setStats(statsRes.data)
        if (selectedDoc) {
          const updated = docsRes.data.documents.find(d => d.id === selectedDoc.id)
          if (updated) setSelectedDoc(updated)
        }
      } catch (err) {
        // silent fail, will retry on next interval
      }
    }, 3000)

    return () => clearInterval(interval)
  }, [documents, selectedDoc?.id])

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  const loadData = async () => {
    try {
      const [userRes, docsRes, statsRes] = await Promise.all([
        authAPI.me(),
        documentsAPI.list(),
        aiAPI.dashboard()
      ])
      setUser(userRes.data)
      setDocuments(docsRes.data.documents)
      setStats(statsRes.data)
    } catch (err) {
      toast.error('Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  const handleUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)
    try {
      await documentsAPI.upload(file)
      toast.success('Document uploaded! Processing... ⚡')
      setTimeout(loadData, 4000)
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Upload failed')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const handleDelete = async (docId, e) => {
    e.stopPropagation()
    try {
      await documentsAPI.delete(docId)
      toast.success('Document deleted')
      if (selectedDoc?.id === docId) setSelectedDoc(null)
      loadData()
    } catch (err) {
      toast.error('Delete failed')
    }
  }
  const handleRename = async () => {
    if (!editNameValue.trim() || editNameValue === selectedDoc.original_filename) {
      setIsEditingName(false)
      return
    }
    try {
      const res = await documentsAPI.update(selectedDoc.id, { original_filename: editNameValue.trim() })
      setSelectedDoc(res.data)
      setDocuments(documents.map(d => d.id === res.data.id ? res.data : d))
      toast.success('Renamed successfully')
    } catch (err) {
      toast.error('Rename failed')
    } finally {
      setIsEditingName(false)
    }
  }
  const handleCategoryChange = async (newCategory) => {
    try {
      const res = await documentsAPI.update(selectedDoc.id, { category: newCategory })
      setSelectedDoc(res.data)
      setDocuments(documents.map(d => d.id === res.data.id ? res.data : d))
      toast.success('Category updated')
    } catch (err) {
      toast.error('Category update failed')
    } finally {
      setEditingCategory(false)
    }
  }

  const tabs = [
    { id: 'documents', label: 'Documents', icon: FileText },
    { id: 'chat', label: 'Chat', icon: MessageSquare },
    { id: 'ai', label: 'AI Tools', icon: Brain },
    { id: 'stats', label: 'Analytics', icon: BarChart2 },
    ...(user?.role === 'admin' ? [{ id: 'admin', label: 'Admin Panel', icon: Shield }] : []),
  ]

  const loadAdminUsers = async () => {
    setAdminLoading(true)
    try {
      const res = await adminAPI.listUsers()
      setAdminUsers(res.data)
    } catch (err) {
      toast.error('Failed to load users')
    } finally {
      setAdminLoading(false)
    }
  }

  const statusConfig = {
    ready: { color: 'text-emerald-400', bg: 'bg-emerald-400/10 border-emerald-400/20', icon: CheckCircle, label: 'Ready' },
    processing: { color: 'text-amber-400', bg: 'bg-amber-400/10 border-amber-400/20', icon: Clock, label: 'Processing' },
    error: { color: 'text-red-400', bg: 'bg-red-400/10 border-red-400/20', icon: AlertCircle, label: 'Error' },
    pending: { color: 'text-slate-400', bg: 'bg-slate-400/10 border-slate-400/20', icon: Clock, label: 'Pending' },
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center"
      style={{background: 'radial-gradient(ellipse at center, #1a0533 0%, #080B14 70%)'}}>
      <div className="text-center animate-fadeIn">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-6 animate-pulse-glow"
          style={{background: 'linear-gradient(135deg, #7C3AED, #06B6D4)'}}>
          <Brain className="w-10 h-10 text-white animate-float" />
        </div>
        <div className="flex gap-1 justify-center mb-4">
          <div className="w-2 h-2 rounded-full bg-purple-500 typing-dot" />
          <div className="w-2 h-2 rounded-full bg-purple-500 typing-dot" />
          <div className="w-2 h-2 rounded-full bg-purple-500 typing-dot" />
        </div>
        <p className="text-slate-400 text-sm">Loading your AI workspace...</p>
      </div>
    </div>
  )

  // Document quick action card for Documents tab
  const DocumentPreview = () => {
    if (!selectedDoc) return (
      <div className="h-full flex flex-col items-center justify-center animate-fadeIn p-8">
        <div className="w-full max-w-md">
          {/* Welcome */}
          <div className="text-center mb-10">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 animate-float"
              style={{background: 'linear-gradient(135deg, rgba(124,58,237,0.3), rgba(6,182,212,0.1))', border: '1px solid rgba(124,58,237,0.3)'}}>
              <Zap className="w-8 h-8 text-purple-400" />
            </div>
            <h3 className="text-white text-xl font-bold mb-2">Welcome, {user?.full_name?.split(' ')[0]}! 👋</h3>
            <p className="text-slate-500 text-sm">Select a document from the sidebar to get started</p>
          </div>

          {/* Quick stats */}
          {stats && (
            <div className="grid grid-cols-3 gap-3 mb-8">
              {[
                { label: 'Documents', value: stats.stats.total_documents, color: '#7C3AED' },
                { label: 'Chats', value: stats.stats.total_conversations, color: '#06B6D4' },
                { label: 'AI Requests', value: stats.stats.total_ai_requests, color: '#10B981' },
              ].map(s => (
                <div key={s.label} className="rounded-xl p-4 text-center"
                  style={{background: `${s.color}10`, border: `1px solid ${s.color}25`}}>
                  <div className="text-2xl font-black" style={{color: s.color}}>{s.value}</div>
                  <div className="text-slate-500 text-xs mt-1">{s.label}</div>
                </div>
              ))}
            </div>
          )}

          {/* Upload CTA if no docs */}
          {documents.length === 0 && (
            <label className="w-full flex flex-col items-center justify-center p-8 rounded-2xl cursor-pointer transition-all duration-300"
              style={{background: 'rgba(124,58,237,0.06)', border: '2px dashed rgba(124,58,237,0.3)'}}>
              <Upload className="w-8 h-8 text-purple-400 mb-3" />
              <span className="text-purple-300 font-semibold text-sm">Upload your first document</span>
              <span className="text-slate-600 text-xs mt-1">PDF • DOCX • TXT • CSV</span>
              <input type="file" className="hidden" accept=".pdf,.docx,.txt,.csv" onChange={handleUpload} />
            </label>
          )}
        </div>
      </div>
    )

    const sc = statusConfig[selectedDoc.status] || statusConfig.pending
    const StatusIcon = sc.icon

    return (
      <div className="h-full overflow-y-auto p-6 animate-fadeIn">
        <div className="max-w-2xl mx-auto">

          {/* Doc header */}
          <div className="rounded-2xl p-6 mb-5"
            style={{background: 'linear-gradient(135deg, rgba(124,58,237,0.15), rgba(6,182,212,0.05))', border: '1px solid rgba(124,58,237,0.25)'}}>
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
                style={{background: 'linear-gradient(135deg, #7C3AED, #06B6D4)'}}>
                <FileText className="w-7 h-7 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                {isEditingName ? (
                  <input
                    autoFocus
                    value={editNameValue}
                    onChange={(e) => setEditNameValue(e.target.value)}
                    onBlur={handleRename}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setIsEditingName(false) }}
                    className="text-white font-bold text-lg bg-transparent border-b border-purple-400 outline-none w-full"
                  />
                ) : (
                  <h2
                    className="text-white font-bold text-lg truncate cursor-pointer hover:text-purple-300 transition-colors flex items-center gap-2 group"
                    onClick={() => { setEditNameValue(selectedDoc.original_filename); setIsEditingName(true) }}
                    title="Click to rename"
                  >
                    <span className="truncate">{selectedDoc.original_filename}</span>
                    <Pencil className="w-3.5 h-3.5 text-slate-500 group-hover:text-purple-300 flex-shrink-0" />
                  </h2>
                )}
                <div className="flex items-center gap-3 mt-2 flex-wrap">
                  <div className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs border ${sc.bg} ${sc.color}`}>
                    <StatusIcon className="w-3 h-3" />
                    {sc.label}
                  </div>
                  <span className="text-slate-500 text-xs">{selectedDoc.chunk_count} chunks indexed</span>
                  <span className="text-slate-500 text-xs">{selectedDoc.file_type?.toUpperCase()}</span>
                  <span className="text-slate-500 text-xs">{(selectedDoc.file_size / 1024).toFixed(1)} KB</span>
                  {editingCategory ? (
                    <select
                      autoFocus
                      defaultValue={selectedDoc.category || ''}
                      onChange={(e) => handleCategoryChange(e.target.value)}
                      onBlur={() => setEditingCategory(false)}
                      className="bg-slate-800 text-white text-xs rounded-full px-2 py-1 border border-purple-400 outline-none"
                    >
                      <option value="">No category</option>
                      <option value="Personal">Personal</option>
                      <option value="Work">Work</option>
                      <option value="Academic">Academic</option>
                      <option value="Legal">Legal</option>
                      <option value="Financial">Financial</option>
                    </select>
                  ) : (
                    <span
                      className="text-purple-300 text-xs px-2 py-1 rounded-full border border-purple-400/30 cursor-pointer hover:bg-purple-400/10 transition-colors"
                      onClick={() => setEditingCategory(true)}
                      title="Click to set category"
                    >
                      {selectedDoc.category || '+ Add category'}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={(e) => handleDelete(selectedDoc.id, e)}
                className="p-2 rounded-xl text-slate-600 hover:text-red-400 hover:bg-red-400/10 transition-all"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Quick actions */}
          <h3 className="text-slate-400 text-xs uppercase tracking-wider font-semibold mb-3 px-1">Quick Actions</h3>
          <div className="grid grid-cols-1 gap-3 mb-5">
            {[
              {
                icon: Bot,
                title: 'Chat with Document',
                desc: 'Ask questions and get AI-powered answers from your document',
                tab: 'chat',
                color: '#7C3AED',
                gradient: 'rgba(124,58,237,0.1)'
              },
              {
                icon: Brain,
                title: 'AI Analysis',
                desc: 'Summarize, generate questions, sentiment analysis, NER & semantic search',
                tab: 'ai',
                color: '#06B6D4',
                gradient: 'rgba(6,182,212,0.08)'
              },
              {
                icon: View,
                title: 'View Analytics',
                desc: 'Overview of uploaded documents, AI activity, and document processing status',
                tab: 'stats',
                color: '#10B981',
                gradient: 'rgba(16,185,129,0.08)'
              },
            ].map((action) => (
              <button
                key={action.title}
                onClick={() => setActiveTab(action.tab)}
                disabled={selectedDoc.status !== 'ready'}
                className="w-full flex items-center gap-4 p-4 rounded-2xl text-left transition-all duration-200 group disabled:opacity-40"
                style={{background: action.gradient, border: `1px solid ${action.color}20`}}
                onMouseEnter={e => {
                  e.currentTarget.style.border = `1px solid ${action.color}50`
                  e.currentTarget.style.background = `${action.gradient.replace('0.1', '0.18').replace('0.08', '0.15')}`
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.border = `1px solid ${action.color}20`
                  e.currentTarget.style.background = action.gradient
                }}
              >
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{background: `${action.color}20`}}>
                  <action.icon className="w-5 h-5" style={{color: action.color}} />
                </div>
                <div className="flex-1">
                  <div className="text-white font-semibold text-sm">{action.title}</div>
                  <div className="text-slate-500 text-xs mt-0.5">{action.desc}</div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-slate-400 transition-colors" />
              </button>
            ))}
          </div>

          {selectedDoc.status !== 'ready' && (
            <div className="rounded-xl p-4 flex items-center gap-3"
              style={{background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)'}}>
              <Loader className="w-4 h-4 text-amber-400 animate-spin flex-shrink-0" />
              <p className="text-amber-300 text-sm">Document is being processed. Please wait...</p>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex" style={{background: '#080B14'}}>

      {/* Mobile hamburger button */}
      <button
        onClick={() => setMobileMenuOpen(true)}
        className="md:hidden fixed top-4 left-4 z-30 w-10 h-10 rounded-xl flex items-center justify-center"
        style={{background: 'rgba(124,58,237,0.25)', border: '1px solid rgba(124,58,237,0.4)'}}
      >
        <Menu className="w-5 h-5 text-purple-300" />
      </button>

      {/* Mobile backdrop */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 bg-black/60 z-40 md:hidden" onClick={() => setMobileMenuOpen(false)} />
      )}

      {/* Sidebar */}
      <div className={`w-64 flex flex-col flex-shrink-0 fixed md:static inset-y-0 left-0 z-50 transition-transform duration-300 ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}
        style={{background: 'rgba(15,22,41,0.98)', borderRight: '1px solid rgba(124,58,237,0.15)'}}>

        {/* Logo */}
        <div className="p-5 border-b" style={{borderColor: 'rgba(124,58,237,0.15)'}}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center animate-pulse-glow"
                style={{background: 'linear-gradient(135deg, #7C3AED, #06B6D4)'}}>
                <Brain className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-white font-bold text-sm gradient-text">AI Doc Intel</h2>
                <p className="text-slate-500 text-xs truncate max-w-[130px]">{user?.full_name}</p>
              </div>
            </div>
            <button onClick={() => setMobileMenuOpen(false)} className="md:hidden text-slate-500 hover:text-white p-1">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Nav */}
        <nav className="p-3 flex-1">
          <p className="text-slate-700 text-xs uppercase tracking-wider font-semibold px-3 mb-2">Menu</p>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); if (tab.id === 'admin') loadAdminUsers() }}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl mb-1 text-sm font-medium transition-all duration-200"
              style={activeTab === tab.id ? {
                background: 'linear-gradient(135deg, rgba(124,58,237,0.25), rgba(6,182,212,0.08))',
                border: '1px solid rgba(124,58,237,0.4)',
                color: '#A78BFA'
              } : {
                color: '#64748B',
                border: '1px solid transparent'
              }}
            >
              <tab.icon className="w-4 h-4" style={activeTab === tab.id ? {color: '#A78BFA'} : {}} />
              {tab.label}
              {activeTab === tab.id && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-purple-400" />}
            </button>
          ))}
        </nav>

        {/* Logout */}
        <div className="p-4 border-t" style={{borderColor: 'rgba(124,58,237,0.1)'}}>
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-500 hover:text-red-400 transition-all duration-200 text-sm"
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.08)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 flex overflow-hidden" style={{background: 'radial-gradient(ellipse at top left, rgba(124,58,237,0.04), transparent 50%)'}}>

        {/* Documents list - show on documents/chat/ai tabs */}
        {(activeTab === 'documents' || activeTab === 'chat' || activeTab === 'ai') && (isMobile ? !selectedDoc : true) && (
          <div className={isMobile ? "fixed inset-0 z-20 pt-16 px-3 pb-3" : "relative flex-shrink-0 my-4 ml-4"} style={isMobile ? {
            background: '#080B14',
            width: '100%'
          } : {
            width: docsPanelOpen ? '288px' : '0px',
            transition: 'width 0.3s ease',
            overflow: 'hidden'
          }}>
            {/* Toggle handle - desktop only, sits on the edge, always visible */}
            <button
              onClick={() => setDocsPanelOpen(!docsPanelOpen)}
              className="hidden md:flex absolute top-1/2 -translate-y-1/2 z-10 items-center justify-center w-6 h-14 rounded-r-lg transition-all duration-300"
              style={{
                left: docsPanelOpen ? '288px' : '0px',
                background: 'rgba(124,58,237,0.25)',
                border: '1px solid rgba(124,58,237,0.35)',
                borderLeft: docsPanelOpen ? 'none' : '1px solid rgba(124,58,237,0.35)'
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(124,58,237,0.4)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(124,58,237,0.25)'}
            >
              <ChevronRight className="w-3.5 h-3.5 text-purple-300 transition-transform duration-300"
                style={{transform: docsPanelOpen ? 'rotate(180deg)' : 'rotate(0deg)'}} />
            </button>

            <div className="h-full flex flex-col rounded-2xl overflow-hidden"
              style={{
                width: isMobile ? '100%' : '288px',
                opacity: (isMobile || docsPanelOpen) ? 1 : 0,
                transition: 'opacity 0.2s ease',
                pointerEvents: (isMobile || docsPanelOpen) ? 'auto' : 'none',
                background: 'linear-gradient(180deg, rgba(19,26,48,0.9), rgba(13,18,33,0.9))',
                border: '1px solid rgba(124,58,237,0.16)',
                boxShadow: '0 12px 32px -8px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.03)'
              }}>

            <div className="px-4 py-4" style={{background: 'rgba(124,58,237,0.05)', borderBottom: '1px solid rgba(124,58,237,0.1)'}}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-white font-semibold text-sm tracking-wide">Your Documents</h3>
                <span className="text-xs font-medium px-2.5 py-1 rounded-full"
                  style={{background: 'rgba(124,58,237,0.15)', color: '#A78BFA'}}>
                  {documents.length} files
                </span>
              </div>

              <label className="w-full flex items-center justify-center gap-2 py-3 rounded-xl cursor-pointer transition-all duration-300 text-sm font-medium"
                style={{
                  background: uploading ? 'rgba(124,58,237,0.18)' : 'rgba(124,58,237,0.1)',
                  border: '1px dashed rgba(124,58,237,0.4)'
                }}
                onMouseEnter={e => { if(!uploading) e.currentTarget.style.background = 'rgba(124,58,237,0.18)' }}
                onMouseLeave={e => { if(!uploading) e.currentTarget.style.background = 'rgba(124,58,237,0.1)' }}
              >
                {uploading
                  ? <><Loader className="w-4 h-4 text-purple-400 animate-spin" /><span className="text-purple-400">Uploading...</span></>
                  : <><Upload className="w-4 h-4 text-purple-400" /><span className="text-purple-300">Upload Document</span></>
                }
                <input type="file" className="hidden" accept=".pdf,.docx,.txt,.csv" onChange={handleUpload} disabled={uploading} />
              </label>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {documents.length === 0 ? (
                <div className="text-center py-12 animate-fadeIn">
                  <FileText className="w-10 h-10 text-purple-900 mx-auto mb-3" />
                  <p className="text-slate-500 text-sm font-medium">No documents yet</p>
                  <p className="text-slate-600 text-xs mt-1">Upload your first file above</p>
                </div>
              ) : (
                documents.map((doc, i) => {
                  const sc = statusConfig[doc.status] || statusConfig.pending
                  const StatusIcon = sc.icon
                  const isSelected = selectedDoc?.id === doc.id
                  return (
                    <div
                      key={doc.id}
                      onClick={() => setSelectedDoc(doc)}
                      className="p-3 rounded-xl cursor-pointer transition-all duration-200 group animate-fadeIn"
                      style={{
                        animationDelay: `${i * 50}ms`,
                        background: isSelected
                          ? 'linear-gradient(135deg, rgba(124,58,237,0.2), rgba(6,182,212,0.05))'
                          : 'rgba(15,22,41,0.5)',
                        border: isSelected
                          ? '1px solid rgba(124,58,237,0.5)'
                          : '1px solid rgba(124,58,237,0.08)'
                      }}
                      onMouseEnter={e => {
                        if (!isSelected) {
                          e.currentTarget.style.border = '1px solid rgba(124,58,237,0.2)'
                          e.currentTarget.style.background = 'rgba(124,58,237,0.07)'
                        }
                      }}
                      onMouseLeave={e => {
                        if (!isSelected) {
                          e.currentTarget.style.border = '1px solid rgba(124,58,237,0.08)'
                          e.currentTarget.style.background = 'rgba(15,22,41,0.5)'
                        }
                      }}
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{background: isSelected ? 'rgba(124,58,237,0.3)' : 'rgba(124,58,237,0.1)'}}>
                          <FileText className="w-4 h-4 text-purple-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-xs font-medium truncate">{doc.original_filename}</p>
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ${sc.bg} ${sc.color}`}>
                              <StatusIcon className="w-2.5 h-2.5" />
                              {sc.label}
                            </div>
                            <span className="text-slate-600 text-xs">{doc.chunk_count} chunks</span>
                          </div>
                        </div>
                        <button
                          onClick={(e) => handleDelete(doc.id, e)}
                          className="opacity-0 group-hover:opacity-100 p-1 text-slate-600 hover:text-red-400 transition-all flex-shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
            </div>
          </div>
        )}

        {/* Right content panel */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {isMobile && selectedDoc && (activeTab === 'documents' || activeTab === 'chat' || activeTab === 'ai') && (
            <button
              onClick={() => setSelectedDoc(null)}
              className="flex items-center gap-2 px-4 py-3 text-slate-400 hover:text-white text-sm flex-shrink-0 mt-16 md:mt-0"
            >
              <ChevronRight className="w-4 h-4 rotate-180" /> Back to documents
            </button>
          )}
          <div className="flex-1 overflow-hidden">
          {activeTab === 'documents' && <DocumentPreview />}
          {activeTab === 'chat' && <ChatPanel selectedDoc={selectedDoc} />}
          {activeTab === 'ai' && <AIPanel selectedDoc={selectedDoc} allDocuments={documents} />}

          {/* Analytics */}
          {activeTab === 'stats' && stats && (
            <div className="h-full overflow-y-auto p-8 animate-fadeIn">
              <div className="max-w-4xl mx-auto">
                <div className="flex items-center gap-3 mb-8">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{background: 'linear-gradient(135deg, #7C3AED, #06B6D4)'}}>
                    <TrendingUp className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-white text-xl font-bold">Analytics Dashboard</h2>
                    <p className="text-slate-500 text-sm">Welcome back, {stats.user.name}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                  {[
                    { label: 'Total Documents', value: stats.stats.total_documents, icon: FileText, color: '#7C3AED' },
                    { label: 'Ready', value: stats.stats.ready_documents, icon: CheckCircle, color: '#10B981' },
                    { label: 'Conversations', value: stats.stats.total_conversations, icon: MessageSquare, color: '#06B6D4' },
                    { label: 'AI Requests', value: stats.stats.total_ai_requests, icon: Zap, color: '#F59E0B' },
                  ].map((s, i) => (
                    <div key={s.label} className="rounded-2xl p-5 card-hover animate-fadeIn"
                      style={{
                        animationDelay: `${i * 80}ms`,
                        background: `radial-gradient(ellipse at top left, ${s.color}18, rgba(15,22,41,0.8))`,
                        border: `1px solid ${s.color}25`
                      }}>
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
                        style={{background: `${s.color}20`}}>
                        <s.icon className="w-5 h-5" style={{color: s.color}} />
                      </div>
                      <div className="text-4xl font-black text-white mb-1">{s.value}</div>
                      <div className="text-slate-400 text-xs font-medium">{s.label}</div>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="rounded-2xl p-6" style={{background: 'rgba(15,22,41,0.8)', border: '1px solid rgba(124,58,237,0.15)'}}>
                    <h3 className="text-white font-bold mb-5 flex items-center gap-2 text-sm">
                      <File className="w-4 h-4 text-purple-400" /> File Types
                    </h3>
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie
                          data={Object.entries(stats.file_type_breakdown).map(([type, count]) => ({ name: type.toUpperCase(), value: count }))}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={75}
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                          labelLine={{ stroke: '#64748B' }}
                        >
                          {Object.entries(stats.file_type_breakdown).map((_, i) => (
                            <Cell key={i} fill={['#7C3AED', '#06B6D4', '#10B981', '#F59E0B', '#EF4444'][i % 5]} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="rounded-2xl p-6" style={{background: 'rgba(15,22,41,0.8)', border: '1px solid rgba(124,58,237,0.15)'}}>
                    <h3 className="text-white font-bold mb-5 flex items-center gap-2 text-sm">
                      <Clock className="w-4 h-4 text-purple-400" /> Recent Documents
                    </h3>
                    <div className="space-y-3">
                      {stats.recent_documents.map((doc, i) => {
                        const sc = statusConfig[doc.status] || statusConfig.pending
                        return (
                          <div key={i} className="flex items-center gap-3 py-2 border-b last:border-0"
                            style={{borderColor: 'rgba(124,58,237,0.08)'}}>
                            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                              style={{background: 'rgba(124,58,237,0.1)'}}>
                              <FileText className="w-4 h-4 text-purple-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-white text-xs font-medium truncate">{doc.original_filename}</p>
                              <p className="text-slate-500 text-xs">{doc.chunk_count} chunks</p>
                            </div>
                            <span className={`text-xs ${sc.color}`}>{sc.label}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>

                {stats.performance && stats.performance.by_feature.length > 0 && (
                  <div className="rounded-2xl p-6 mt-6" style={{background: 'rgba(15,22,41,0.8)', border: '1px solid rgba(124,58,237,0.15)'}}>
                    <h3 className="text-white font-bold mb-5 flex items-center gap-2 text-sm">
                      <Zap className="w-4 h-4 text-purple-400" /> AI Performance by Feature
                    </h3>
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={stats.performance.by_feature}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(124,58,237,0.1)" />
                        <XAxis dataKey="feature" stroke="#64748B" fontSize={12} />
                        <YAxis stroke="#64748B" fontSize={12} label={{ value: 'ms', angle: -90, position: 'insideLeft', fill: '#64748B' }} />
                        <Tooltip
                          cursor={{ fill: 'rgba(124,58,237,0.08)' }}
                          contentStyle={{ background: '#0F1629', border: '1px solid rgba(124,58,237,0.3)', borderRadius: '8px', color: '#fff' }}
                        />
                        <Bar dataKey="avg_response_time_ms" name="Avg Response Time (ms)" fill="#7C3AED" radius={[6, 6, 0, 0]} maxBarSize={80} />
                      </BarChart>
                    </ResponsiveContainer>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-4">
                      {stats.performance.by_feature.map(f => (
                        <div key={f.feature} className="rounded-xl p-3" style={{background: 'rgba(124,58,237,0.06)', border: '1px solid rgba(124,58,237,0.15)'}}>
                          <p className="text-slate-500 text-xs capitalize">{f.feature}</p>
                          <p className="text-white text-sm font-bold">{f.total_requests} requests</p>
                          {f.total_tokens > 0 && <p className="text-purple-300 text-xs">{f.total_tokens} tokens</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {stats.performance && stats.performance.response_time_histogram && stats.performance.response_time_histogram.length > 0 && (
                  <div className="rounded-2xl p-6 mt-6" style={{background: 'rgba(15,22,41,0.8)', border: '1px solid rgba(124,58,237,0.15)'}}>
                    <h3 className="text-white font-bold mb-5 flex items-center gap-2 text-sm">
                      <BarChart2 className="w-4 h-4 text-purple-400" /> Response Time Distribution
                    </h3>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={stats.performance.response_time_histogram}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(124,58,237,0.1)" />
                        <XAxis dataKey="bucket" stroke="#64748B" fontSize={12} />
                        <YAxis stroke="#64748B" fontSize={12} allowDecimals={false} label={{ value: 'requests', angle: -90, position: 'insideLeft', fill: '#64748B' }} />
                        <Tooltip
                          cursor={{ fill: 'rgba(6,182,212,0.08)' }}
                          contentStyle={{ background: '#0F1629', border: '1px solid rgba(6,182,212,0.3)', borderRadius: '8px', color: '#fff' }}
                        />
                        <Bar dataKey="count" name="Requests" fill="#06B6D4" radius={[6, 6, 0, 0]} maxBarSize={60} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Admin Panel */}
          {activeTab === 'admin' && (
            <div className="h-full overflow-y-auto p-8 animate-fadeIn">
              <div className="max-w-4xl mx-auto">
                <div className="flex items-center gap-3 mb-8">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{background: 'linear-gradient(135deg, #EF4444, #F59E0B)'}}>
                    <Shield className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-white text-xl font-bold">Admin Panel</h2>
                    <p className="text-slate-500 text-sm">Manage all registered users</p>
                  </div>
                </div>

                {adminLoading ? (
                  <div className="text-center py-12 text-slate-500 text-sm">Loading users...</div>
                ) : (
                  <div className="rounded-2xl overflow-hidden" style={{background: 'rgba(15,22,41,0.8)', border: '1px solid rgba(124,58,237,0.15)'}}>
                    <table className="w-full text-sm">
                      <thead>
                        <tr style={{background: 'rgba(124,58,237,0.08)'}}>
                          <th className="text-left text-slate-400 font-semibold px-5 py-3">Name</th>
                          <th className="text-left text-slate-400 font-semibold px-5 py-3">Email</th>
                          <th className="text-left text-slate-400 font-semibold px-5 py-3">Role</th>
                          <th className="text-left text-slate-400 font-semibold px-5 py-3">Status</th>
                          <th className="text-left text-slate-400 font-semibold px-5 py-3">Documents</th>
                          <th className="text-left text-slate-400 font-semibold px-5 py-3">Joined</th>
                          <th className="text-left text-slate-400 font-semibold px-5 py-3">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {adminUsers.map((u) => (
                          <tr key={u.id} className="border-t" style={{borderColor: 'rgba(124,58,237,0.08)'}}>
                            <td className="px-5 py-3 text-white font-medium">{u.full_name}</td>
                            <td className="px-5 py-3 text-slate-400">{u.email}</td>
                            <td className="px-5 py-3">
                              <span className={`px-2 py-1 rounded-full text-xs border ${u.role === 'admin' ? 'text-amber-300 bg-amber-400/10 border-amber-400/20' : 'text-slate-400 bg-slate-400/10 border-slate-400/20'}`}>
                                {u.role}
                              </span>
                            </td>
                            <td className="px-5 py-3">
                              <span className={`px-2 py-1 rounded-full text-xs border ${u.is_active ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20' : 'text-red-400 bg-red-400/10 border-red-400/20'}`}>
                                {u.is_active ? 'Active' : 'Disabled'}
                              </span>
                            </td>
                            <td className="px-5 py-3 text-slate-400">{u.total_documents}</td>
                            <td className="px-5 py-3 text-slate-500 text-xs">{new Date(u.created_at).toLocaleDateString()}</td>
                            <td className="px-5 py-3">
                              <div className="flex gap-2">
                                <button
                                  onClick={async () => {
                                    try {
                                      const newRole = u.role === 'admin' ? 'user' : 'admin'
                                      await adminAPI.changeRole(u.id, newRole)
                                      toast.success(`Role changed to ${newRole}`)
                                      loadAdminUsers()
                                    } catch (err) {
                                      toast.error('Failed to change role')
                                    }
                                  }}
                                  className="text-xs px-2 py-1 rounded-lg border border-purple-400/30 text-purple-300 hover:bg-purple-400/10 transition-colors"
                                >
                                  {u.role === 'admin' ? 'Make User' : 'Make Admin'}
                                </button>
                                <button
                                  onClick={async () => {
                                    try {
                                      await adminAPI.toggleStatus(u.id, !u.is_active)
                                      toast.success(u.is_active ? 'User disabled' : 'User activated')
                                      loadAdminUsers()
                                    } catch (err) {
                                      toast.error('Failed to update status')
                                    }
                                  }}
                                  className={`text-xs px-2 py-1 rounded-lg border transition-colors ${u.is_active ? 'border-red-400/30 text-red-300 hover:bg-red-400/10' : 'border-emerald-400/30 text-emerald-300 hover:bg-emerald-400/10'}`}
                                >
                                  {u.is_active ? 'Disable' : 'Enable'}
                                </button>
                                <button
                                  onClick={async () => {
                                    if (!window.confirm(`Delete ${u.full_name}? This cannot be undone.`)) return
                                    try {
                                      await adminAPI.deleteUser(u.id)
                                      toast.success('User deleted')
                                      loadAdminUsers()
                                    } catch (err) {
                                      toast.error(err.response?.data?.error?.message || 'Failed to delete user')
                                    }
                                  }}
                                  className="text-xs px-2 py-1 rounded-lg border border-red-500/40 text-red-400 hover:bg-red-500/15 transition-colors"
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {adminUsers.length === 0 && (
                      <div className="text-center py-12 text-slate-500 text-sm">No users found</div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
          </div>
        </div>
      </div>
    </div>
  )
}