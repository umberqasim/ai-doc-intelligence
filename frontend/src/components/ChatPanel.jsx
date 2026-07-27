import { useState, useRef, useEffect } from 'react'
import { chatAPI, API_BASE } from '../services/api'
import toast from 'react-hot-toast'
import { Send, Bot, User, MessageSquare } from 'lucide-react'
import ReactMarkdown from 'react-markdown'

export default function ChatPanel({ selectedDoc }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(true)
  const messagesEndRef = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Document select hote hi (ya tab pe wapis aate hi) purani history load karo
  useEffect(() => {
    if (!selectedDoc) return
    setLoadingHistory(true)
    chatAPI.history(selectedDoc.id)
      .then(res => {
        // backend newest-first bhejta hai, hume chronological (oldest-first) chahiye
        const convs = [...res.data.conversations].reverse()
        const flat = convs.flatMap(c => c.messages)
        setMessages(flat)
      })
      .catch(() => setMessages([]))
      .finally(() => setLoadingHistory(false))
  }, [selectedDoc?.id])

  const sendMessage = async () => {
    if (!input.trim() || !selectedDoc) return
    if (selectedDoc.status !== 'ready') {
      toast.error('Document is still processing')
      return
    }

    const question = input
    const userMsg = { role: 'user', content: question }
    setMessages(prev => [...prev, userMsg, { role: 'assistant', content: '', sources: [], streaming: true }])
    setInput('')
    setLoading(true)

    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`${API_BASE}/chat/query/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ document_id: selectedDoc.id, question })
      })

      if (!response.ok || !response.body) {
        throw new Error('Stream request failed')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n\n')
        buffer = lines.pop()

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const payload = JSON.parse(line.slice(6))

          if (payload.type === 'sources') {
            setMessages(prev => {
              const updated = [...prev]
              updated[updated.length - 1] = { ...updated[updated.length - 1], sources: payload.sources }
              return updated
            })
          } else if (payload.type === 'token') {
            setMessages(prev => {
              const updated = [...prev]
              const last = updated[updated.length - 1]
              updated[updated.length - 1] = { ...last, content: last.content + payload.content }
              return updated
            })
          } else if (payload.type === 'error') {
            toast.error(payload.message || 'Streaming error')
          }
        }
      }

      setMessages(prev => {
        const updated = [...prev]
        updated[updated.length - 1] = { ...updated[updated.length - 1], streaming: false }
        return updated
      })
    } catch (err) {
      toast.error('Failed to get response')
      setMessages(prev => prev.slice(0, -2))
    } finally {
      setLoading(false)
    }
  }

  if (!selectedDoc) return (
    <div className="h-full flex items-center justify-center">
      <div className="text-center">
        <MessageSquare className="w-16 h-16 text-slate-700 mx-auto mb-4" />
        <p className="text-slate-400 text-xl font-semibold">Select a document to chat</p>
      </div>
    </div>
  )

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b border-slate-700 bg-slate-800/50">
        <h3 className="text-white font-semibold">Chat with: {selectedDoc.original_filename}</h3>
        <p className="text-slate-400 text-xs mt-0.5">{selectedDoc.chunk_count} chunks indexed</p>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {loadingHistory && (
          <div className="text-center py-12 text-slate-500 text-sm">Loading conversation...</div>
        )}

        {!loadingHistory && messages.length === 0 && (
          <div className="text-center py-12">
            <Bot className="w-12 h-12 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-500">Ask anything about your document!</p>
          </div>
        )}

        {!loadingHistory && messages.map((msg, i) => (
          <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && (
              <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                <Bot className="w-4 h-4 text-white" />
              </div>
            )}
            <div className={`max-w-[75%] ${msg.role === 'user' ? 'order-first' : ''}`}>
              <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white rounded-tr-sm'
                  : 'bg-slate-700 text-slate-100 rounded-tl-sm markdown'
              }`}>
                {msg.role === 'assistant'
                  ? <ReactMarkdown>{msg.content}</ReactMarkdown>
                  : msg.content}
              </div>
              {msg.sources && msg.sources.length > 0 && (
                <details className="mt-2">
                  <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-400">
                    View sources ({msg.sources.length})
                  </summary>
                  <div className="mt-2 space-y-1">
                    {msg.sources.map((src, si) => (
                      <div key={si} className="text-xs text-slate-500 bg-slate-800 p-2 rounded-lg border border-slate-700">
                        {src.substring(0, 150)}...
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
            {msg.role === 'user' && (
              <div className="w-8 h-8 bg-slate-600 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                <User className="w-4 h-4 text-white" />
              </div>
            )}
          </div>
        ))}

        {loading && messages.length > 0 && messages[messages.length - 1].content === '' && (
          <div className="flex gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <div className="bg-slate-700 px-4 py-3 rounded-2xl rounded-tl-sm">
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{animationDelay: '0ms'}} />
                <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{animationDelay: '150ms'}} />
                <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{animationDelay: '300ms'}} />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 border-t border-slate-700">
        <div className="flex gap-3">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
            placeholder="Ask about your document..."
            className="flex-1 px-4 py-3 bg-slate-700 border border-slate-600 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 transition text-sm"
          />
          <button
            onClick={sendMessage}
            disabled={loading || !input.trim()}
            className="px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-xl transition"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  )
}