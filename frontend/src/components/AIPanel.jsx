import { useState, useEffect } from 'react'
import { aiAPI } from '../services/api'
import toast from 'react-hot-toast'
import { Brain, FileText, HelpCircle, Heart, Tag, Search, Loader, Sparkles, Zap, RefreshCw, GitCompare, Languages, Download } from 'lucide-react'
import ReactMarkdown from 'react-markdown'

export default function AIPanel({ selectedDoc, allDocuments = [] }) {
  const [activeFeature, setActiveFeature] = useState('summarize')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [summaryType, setSummaryType] = useState('short')
  const [questionType, setQuestionType] = useState('faq')
  const [searchQuery, setSearchQuery] = useState('')
  const [cache, setCache] = useState({}) // key: "feature:subType" -> result object
  const [cacheLoading, setCacheLoading] = useState(false)
  const [expandedResults, setExpandedResults] = useState({}) // search result index -> true/false
  const [compareDocId, setCompareDocId] = useState('')
  const [compareResult, setCompareResult] = useState(null)
  const [targetLanguage, setTargetLanguage] = useState('Spanish')
  const [translationResult, setTranslationResult] = useState(null)

  const features = [
    { id: 'summarize', label: 'Summarize', icon: FileText, color: '#7C3AED' },
    { id: 'questions', label: 'Questions', icon: HelpCircle, color: '#06B6D4' },
    { id: 'sentiment', label: 'Sentiment', icon: Heart, color: '#EC4899' },
    { id: 'ner', label: 'Entities', icon: Tag, color: '#F59E0B' },
    { id: 'search', label: 'Search', icon: Search, color: '#10B981' },
    { id: 'compare', label: 'Compare', icon: GitCompare, color: '#EF4444' },
    { id: 'translate', label: 'Translate', icon: Languages, color: '#8B5CF6' },
  ]

  // Document badalte hi saare cached results (agar backend pe save hain) fetch karo
  useEffect(() => {
    if (!selectedDoc) { setCache({}); return }
    setCacheLoading(true)
    aiAPI.cachedResults(selectedDoc.id)
      .then(res => {
        const map = {}
        res.data.results.forEach(r => {
          map[`${r.feature}:${r.sub_type}`] = r.result
        })
        setCache(map)
      })
      .catch(() => setCache({}))
      .finally(() => setCacheLoading(false))
  }, [selectedDoc?.id])

  // Feature ya sub-type badalte hi cache se result dikhao (agar hai)
  useEffect(() => {
    if (activeFeature === 'search') { setResult(null); return }
    const subType = activeFeature === 'summarize' ? summaryType
      : activeFeature === 'questions' ? questionType
      : null
    const key = `${activeFeature}:${subType}`
    setResult(cache[key] || null)
  }, [activeFeature, summaryType, questionType, cache])

  const runFeature = async () => {
    if (!selectedDoc) { toast.error('Select a document first'); return }
    if (selectedDoc.status !== 'ready') { toast.error('Document still processing'); return }

    setLoading(true)
    try {
      let res
      if (activeFeature === 'summarize') res = await aiAPI.summarize(selectedDoc.id, summaryType)
      else if (activeFeature === 'questions') res = await aiAPI.questions(selectedDoc.id, questionType)
      else if (activeFeature === 'sentiment') res = await aiAPI.sentiment(selectedDoc.id)
      else if (activeFeature === 'ner') res = await aiAPI.ner(selectedDoc.id)
      else if (activeFeature === 'search') res = await aiAPI.search(searchQuery, selectedDoc.id)
      else if (activeFeature === 'compare') {
        if (!compareDocId) { toast.error('Select a document to compare with'); setLoading(false); return }
        res = await aiAPI.compare(selectedDoc.id, compareDocId)
        setCompareResult(res.data)
        setLoading(false)
        return
      }
      else if (activeFeature === 'translate') {
        res = await aiAPI.translate(selectedDoc.id, targetLanguage)
        setTranslationResult(res.data)
        setLoading(false)
        return
      }

      setResult(res.data)

      // search ko cache nahi karte, baaki sab ko karte hain
      if (activeFeature !== 'search') {
        const subType = activeFeature === 'summarize' ? summaryType
          : activeFeature === 'questions' ? questionType
          : null
        const key = `${activeFeature}:${subType}`
        setCache(prev => ({ ...prev, [key]: res.data }))
      }
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Analysis failed')
    } finally {
      setLoading(false)
    }
  }

  const activeF = features.find(f => f.id === activeFeature)

  const handleExportPdf = async () => {
    if (!selectedDoc) return
    try {
      const res = await aiAPI.exportPdf(selectedDoc.id)
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `ai_report_${selectedDoc.original_filename.replace(/\.[^/.]+$/, '')}.pdf`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
      toast.success('PDF downloaded')
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'No AI results to export yet — run an analysis first')
    }
  }

  // Parses the raw `questions` result into a plain-text intro (if any) plus
  // a list of {q, a} entries. The backend often returns everything as ONE
  // blob of text with inline markers rather than separate array items, so
  // this detects which style of marker is present and splits accordingly:
  //   - FAQ style:       "... Q1: question A1: answer Q2: question A2: ..."
  //   - Quiz style:      "... Question 1 ... options ... Answer: ... Question 2 ..."
  //   - Interview style: "... 1. **Topic**: question 2. **Topic**: question ..."
  const parseQuestionsResult = (items) => {
    if (!items || items.length === 0) return { intro: '', pairs: [] }
    const fullText = items.join('\n\n').trim()

    // The backend sometimes wraps chunks in "**" that don't pair up cleanly
    // once we split the text apart, leaving stray literal asterisks. Since
    // we already bold Q/A via our own badges/styling, strip them here.
    const clean = s => s.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()

    const qMarker = fullText.match(/Q\s*\d+\s*:/)
    const quizMarker = fullText.match(/Question\s+\d+\b/i)
    const numMarker = fullText.match(/(?:^|\s)1\.\s*\*\*/)
    // Fallback: plain numbered list like "1. ...question...? Answer: ..." with no bold markers
    const genericNumMarker = fullText.match(/(?:^|\s)1\.\s+\S/)

    const candidates = [
      qMarker && { type: 'faq', index: qMarker.index },
      quizMarker && { type: 'quiz', index: quizMarker.index },
      numMarker && { type: 'interview', index: numMarker.index },
    ].filter(Boolean)

    if (candidates.length === 0) {
      if (genericNumMarker) {
        const intro = clean(fullText.slice(0, genericNumMarker.index))
        const body = fullText.slice(genericNumMarker.index).trim()
        const segments = body.split(/(?=\d{1,2}\.\s+\S)/).map(s => s.trim()).filter(Boolean)
        const pairs = segments.map(seg => {
          const aMatch = seg.match(/Answer\s*:/i)
          if (aMatch) {
            return {
              q: clean(seg.slice(0, aMatch.index).replace(/^\d{1,2}\.\s*/, '')),
              a: clean(seg.slice(aMatch.index).replace(/^Answer\s*:\s*/i, ''))
            }
          }
          return { q: clean(seg.replace(/^\d{1,2}\.\s*/, '')), a: null }
        })
        return { intro, pairs }
      }
      return { intro: clean(fullText), pairs: [] }
    }

    candidates.sort((a, b) => a.index - b.index)
    const chosen = candidates[0]
    const intro = clean(fullText.slice(0, chosen.index))
    const body = fullText.slice(chosen.index).trim()

    if (chosen.type === 'faq') {
      const segments = body.split(/(?=Q\s*\d+\s*:)/).map(s => s.trim()).filter(Boolean)
      const pairs = segments.map(seg => {
        const aMatch = seg.match(/A\s*\d+\s*:/)
        if (aMatch) {
          return {
            q: clean(seg.slice(0, aMatch.index).replace(/^Q\s*\d+\s*:\s*/, '')),
            a: clean(seg.slice(aMatch.index).replace(/^A\s*\d+\s*:\s*/, ''))
          }
        }
        return { q: clean(seg.replace(/^Q\s*\d+\s*:\s*/, '')), a: null }
      })
      return { intro, pairs }
    }

    if (chosen.type === 'quiz') {
      const segments = body.split(/(?=Question\s+\d+\b)/i).map(s => s.trim()).filter(Boolean)
      const pairs = segments.map(seg => {
        const aMatch = seg.match(/Answer\s*:/i)
        if (aMatch) {
          return {
            q: clean(seg.slice(0, aMatch.index).replace(/^Question\s+\d+\s*/i, '')),
            a: clean(seg.slice(aMatch.index).replace(/^Answer\s*:\s*/i, ''))
          }
        }
        return { q: clean(seg.replace(/^Question\s+\d+\s*/i, '')), a: null }
      })
      return { intro, pairs }
    }

    // interview style — keep original "**Topic**" bold intact
    const rawItems = body
      .split(/(?=\d{1,2}\.\s*\*\*)/)
      .map(s => s.replace(/^\d{1,2}\.\s*/, '').trim())
      .filter(Boolean)
    return { intro, pairs: rawItems.map(q => ({ q, a: null })) }
  }

  // PDF se aaye raw chunk ko saaf karta hai: repeated page/experiment headers
  // hata deta hai, saari whitespace collapse karta hai, aur sirf readability
  // ke liye numbered pseudocode / "#" comment lines apni line pe daalta hai.
  // NOTE: Hum ab per-line "ye code hai ya prose" wala guessing nahi karte —
  // wo approach hi fragile thi aur floating/orphan lines create kar rahi thi.
  // Iski jagah HAR CHUNK ke liye EK dafa decide karte hain (poora code-jaisa
  // hai ya poora prose), aur poora chunk usi hisaab se render hota hai.
  const cleanChunk = (text) => {
    if (!text) return ''
    let t = text
      .replace(/Experiment\s+No\.?\s*\d+\s*:\s*[^.]*?Page\s*\d+/gi, ' ')
      .replace(/\bPage\s*\d+\b/gi, ' ')
      .replace(/[^\S\n]+/g, ' ')
      .trim()

    t = t.replace(/\s(\d{1,2}\.\s)/g, '\n$1')   // numbered pseudocode line
    t = t.replace(/\s(#\s?[A-Za-z+\-])/g, '\n$1') // python comment line

    return t
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean)
      .join('\n')
      .replace(/\n{2,}/g, '\n')
  }

  // Poora chunk overall code-heavy hai ya prose — sirf ek baar decide karo.
  // Kam se kam 2 alag code-signals milne pe hi "code" maana jata hai, taake
  // ek akela lafz (jaise "return" kisi sentence mein) ise galat na bana de.
  const CODE_SIGNALS = /(def \w+\(|function \s*\w*\(|import \w+|board\[|=\s*math\.inf|for \(i|score\s*=\s*minimax|best_score|maximizingPlayer|minEval|maxEval)/g
  const isCodeHeavy = (text) => {
    const matches = text.match(CODE_SIGNALS)
    return !!matches && matches.length >= 2
  }


  const relevanceLabel = (pct) => {
    if (pct >= 50) return { text: 'Strong match', color: '#10B981' }
    if (pct >= 25) return { text: 'Possible match', color: '#F59E0B' }
    return { text: 'Weak match', color: '#64748B' }
  }

  const CHUNK_PREVIEW_LIMIT = 420

  if (!selectedDoc) return (
    <div className="h-full flex items-center justify-center animate-fadeIn">
      <div className="text-center">
        <div className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-4 animate-float"
          style={{background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.2)'}}>
          <Brain className="w-10 h-10 text-purple-700" />
        </div>
        <p className="text-slate-400 text-lg font-semibold">Select a document to analyze</p>
        <p className="text-slate-600 text-sm mt-2">Summarize, extract entities, analyze sentiment & more</p>
      </div>
    </div>
  )

  return (
    <div className="h-full flex flex-col" style={{background: '#080B14'}}>

      {/* Header */}
      <div className="p-4 border-b flex items-center gap-3"
        style={{background: 'rgba(15,22,41,0.9)', borderColor: 'rgba(124,58,237,0.15)'}}>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{background: 'linear-gradient(135deg, #7C3AED, #06B6D4)'}}>
          <Zap className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1">
          <h3 className="text-white font-semibold text-sm">AI Tools</h3>
          <p className="text-purple-400 text-xs truncate max-w-xs">{selectedDoc.original_filename}</p>
        </div>
        <button
          onClick={handleExportPdf}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-slate-300 hover:text-white transition-colors flex-shrink-0"
          style={{background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.25)'}}
          title="Export all AI results for this document as PDF"
        >
          <Download className="w-3.5 h-3.5" /> Export PDF
        </button>
      </div>

      {/* Feature tabs */}
      <div className="p-4 border-b flex gap-2 overflow-x-auto"
        style={{borderColor: 'rgba(124,58,237,0.1)', background: 'rgba(10,15,28,0.5)'}}>
        {features.map(f => (
          <button
            key={f.id}
            onClick={() => setActiveFeature(f.id)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all duration-200 flex-shrink-0"
            style={activeFeature === f.id ? {
              background: `${f.color}25`,
              border: `1px solid ${f.color}60`,
              color: f.color
            } : {
              background: 'rgba(15,22,41,0.6)',
              border: '1px solid rgba(124,58,237,0.1)',
              color: '#64748B'
            }}
          >
            <f.icon className="w-3.5 h-3.5" />
            {f.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">

        {cacheLoading && (
          <div className="text-slate-500 text-xs mb-4">Loading saved results...</div>
        )}

        {/* Options */}
        <div className="mb-6">
          {activeFeature === 'summarize' && (
            <div>
              <p className="text-slate-500 text-xs uppercase tracking-wider mb-3 font-medium">Summary Type</p>
              <div className="flex gap-2 flex-wrap">
                {[
                  { value: 'short', label: 'Short' },
                  { value: 'detailed', label: 'Detailed' },
                  { value: 'bullets', label: 'Bullet Points' },
                  { value: 'key_takeaways', label: 'Key Takeaways' },
                ].map(t => (
                  <button key={t.value} onClick={() => setSummaryType(t.value)}
                    className="px-4 py-2 rounded-xl text-xs font-medium transition-all duration-200"
                    style={summaryType === t.value ? {
                      background: 'rgba(124,58,237,0.25)',
                      border: '1px solid rgba(124,58,237,0.5)',
                      color: '#A78BFA'
                    } : {
                      background: 'rgba(15,22,41,0.6)',
                      border: '1px solid rgba(124,58,237,0.1)',
                      color: '#64748B'
                    }}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeFeature === 'questions' && (
            <div>
              <p className="text-slate-500 text-xs uppercase tracking-wider mb-3 font-medium">Question Type</p>
              <div className="flex gap-2 flex-wrap">
                {[
                  { value: 'faq', label: 'FAQ' },
                  { value: 'interview', label: 'Interview' },
                  { value: 'quiz', label: 'Quiz' },
                ].map(t => (
                  <button key={t.value} onClick={() => setQuestionType(t.value)}
                    className="px-4 py-2 rounded-xl text-xs font-medium transition-all duration-200"
                    style={questionType === t.value ? {
                      background: 'rgba(6,182,212,0.2)',
                      border: '1px solid rgba(6,182,212,0.4)',
                      color: '#06B6D4'
                    } : {
                      background: 'rgba(15,22,41,0.6)',
                      border: '1px solid rgba(124,58,237,0.1)',
                      color: '#64748B'
                    }}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeFeature === 'search' && (
            <div>
              <p className="text-slate-500 text-xs uppercase tracking-wider mb-3 font-medium">Search Query</p>
              <div className="relative">
                <Search className="absolute left-4 top-3.5 w-4 h-4 text-emerald-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && runFeature()}
                  placeholder="Search semantically in your document..."
                  className="w-full pl-11 pr-4 py-3.5 rounded-xl text-white text-sm placeholder-slate-600 focus:outline-none transition-all"
                  style={{background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)'}}
                  onFocus={e => e.target.style.border = '1px solid rgba(16,185,129,0.5)'}
                  onBlur={e => e.target.style.border = '1px solid rgba(16,185,129,0.2)'}
                />
              </div>
            </div>
          )}

          {(activeFeature === 'sentiment' || activeFeature === 'ner') && (
            <p className="text-slate-500 text-sm">
              {activeFeature === 'sentiment'
                ? 'Analyze the overall sentiment and emotional tone of your document.'
                : 'Extract named entities like persons, organizations, locations, and dates.'}
            </p>
          )}
          {activeFeature === 'compare' && (
            <div>
              <p className="text-slate-500 text-xs uppercase tracking-wider mb-3 font-medium">Compare with</p>
              <select
                value={compareDocId}
                onChange={e => setCompareDocId(e.target.value)}
                className="w-full px-4 py-3.5 rounded-xl text-white text-sm focus:outline-none transition-all"
                style={{background: '#1a0f1f', border: '1px solid rgba(239,68,68,0.2)', colorScheme: 'dark'}}
              >
                <option value="" style={{background: '#1a0f1f', color: '#fff'}}>Select a document to compare with...</option>
                {allDocuments.filter(d => d.id !== selectedDoc?.id && d.status === 'ready').map(d => (
                  <option key={d.id} value={d.id} style={{background: '#1a0f1f', color: '#fff'}}>{d.original_filename}</option>
                ))}
              </select>
            </div>
          )}
          {activeFeature === 'translate' && (
            <div>
              <p className="text-slate-500 text-xs uppercase tracking-wider mb-3 font-medium">Translate to</p>
              <select
                value={targetLanguage}
                onChange={e => setTargetLanguage(e.target.value)}
                className="w-full px-4 py-3.5 rounded-xl text-white text-sm focus:outline-none transition-all"
                style={{background: '#170f1f', border: '1px solid rgba(139,92,246,0.2)', colorScheme: 'dark'}}
              >
                {['Spanish', 'French', 'German', 'Urdu', 'Arabic', 'Chinese', 'Hindi', 'Portuguese', 'Russian', 'Japanese'].map(lang => (
                  <option key={lang} value={lang} style={{background: '#170f1f', color: '#fff'}}>{lang}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Run / Regenerate button */}
        <button
          onClick={runFeature}
          disabled={loading || (activeFeature === 'search' && !searchQuery.trim()) || (activeFeature === 'compare' && !compareDocId)}
          // translate has no extra required field beyond a default language, so no extra disabled condition needed
          className="flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm text-white transition-all duration-300 mb-6 disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            background: loading ? 'rgba(124,58,237,0.3)' : `linear-gradient(135deg, ${activeF?.color || '#7C3AED'}, #7C3AED)`,
            boxShadow: loading ? 'none' : `0 4px 20px ${activeF?.color || '#7C3AED'}40`
          }}
        >
          {loading
            ? <><Loader className="w-4 h-4 animate-spin" /> Analyzing...</>
            : result
              ? <><RefreshCw className="w-4 h-4" /> Regenerate {activeF?.label}</>
              : <><Sparkles className="w-4 h-4" /> Run {activeF?.label}</>
          }
        </button>

        {/* Translation Results */}
        {activeFeature === 'translate' && translationResult && (
          <div className="rounded-2xl p-6 animate-fadeIn"
            style={{background: 'rgba(15,22,41,0.6)', border: '1px solid rgba(139,92,246,0.15)'}}>
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <h3 className="text-white font-bold flex items-center gap-2 text-sm">
                <Languages className="w-4 h-4 text-purple-400" /> Translated to {translationResult.target_language}
              </h3>
              <span
                className={`text-xs px-2.5 py-1 rounded-full border ${
                  translationResult.coverage_percent === 100
                    ? 'text-emerald-300 bg-emerald-400/10 border-emerald-400/25'
                    : 'text-amber-300 bg-amber-400/10 border-amber-400/25'
                }`}
                title="Percentage of the document successfully translated"
              >
                {translationResult.coverage_percent}% translated ({translationResult.translated_chunks}/{translationResult.total_chunks} sections)
              </span>
            </div>
            {translationResult.coverage_percent < 100 && (
              <p className="text-amber-400 text-xs mb-3">
                Some sections could not be translated and were kept in the original language below.
              </p>
            )}
            <div className="markdown text-sm text-slate-300 leading-relaxed">
              <ReactMarkdown>{translationResult.translated_text}</ReactMarkdown>
            </div>
          </div>
        )}
        {/* Compare Results */}
        {activeFeature === 'compare' && compareResult && (
          <div className="rounded-2xl p-6 animate-fadeIn"
            style={{background: 'rgba(15,22,41,0.6)', border: '1px solid rgba(239,68,68,0.15)'}}>
            <h3 className="text-white font-bold mb-4 flex items-center gap-2 text-sm">
              <GitCompare className="w-4 h-4 text-red-400" /> Document Comparison
            </h3>
            <div className="markdown text-sm text-slate-300 leading-relaxed">
              <ReactMarkdown>{compareResult.comparison}</ReactMarkdown>
            </div>
          </div>
        )}
        {/* Results */}
        {result && (
          <div className="rounded-2xl p-6 animate-fadeIn"
            style={{background: 'rgba(15,22,41,0.9)', border: `1px solid ${activeF?.color || '#7C3AED'}25`}}>

            {/* Header */}
            <div className="flex items-center gap-2 mb-5 pb-4 border-b"
              style={{borderColor: 'rgba(124,58,237,0.1)'}}>
              {activeF && <activeF.icon className="w-4 h-4" style={{color: activeF.color}} />}
              <span className="text-xs font-bold uppercase tracking-wider" style={{color: activeF?.color}}>
                {activeFeature === 'summarize' ? `${result.summary_type?.replace('_', ' ')} Summary` :
                 activeFeature === 'questions' ? `${result.question_type} Questions` :
                 activeFeature === 'sentiment' ? 'Sentiment Analysis' :
                 activeFeature === 'ner' ? 'Named Entities' : `Results for "${result.query}"`}
              </span>
            </div>

            {/* Summarize */}
            {activeFeature === 'summarize' && (
              <div className="markdown">
                <ReactMarkdown>{result.content}</ReactMarkdown>
              </div>
            )}

            {/* Questions - Q/A visually differentiated by color + badge, intro line kept plain */}
            {activeFeature === 'questions' && (() => {
              const { intro, pairs } = parseQuestionsResult(result.questions || [])
              return (
                <div className="space-y-4">
                  {intro && (
                    <div className="markdown text-slate-500 text-sm italic">
                      <ReactMarkdown>{intro}</ReactMarkdown>
                    </div>
                  )}
                  {pairs.map((pair, i) => (
                    <div key={i} className="rounded-xl overflow-hidden"
                      style={{border: '1px solid rgba(124,58,237,0.12)'}}>

                      {/* Question row */}
                      <div className="flex gap-3 p-4" style={{background: 'rgba(6,182,212,0.08)'}}>
                        <span className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold"
                          style={{background: 'rgba(6,182,212,0.25)', color: '#06B6D4', border: '1px solid rgba(6,182,212,0.4)'}}>
                          Q
                        </span>
                        <div className="markdown text-sm text-white font-semibold flex-1">
                          <ReactMarkdown>{pair.q}</ReactMarkdown>
                        </div>
                      </div>

                      {/* Answer row */}
                      {pair.a && (
                        <div className="flex gap-3 p-4"
                          style={{background: 'rgba(16,185,129,0.05)', borderTop: '1px solid rgba(124,58,237,0.1)'}}>
                          <span className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold"
                            style={{background: 'rgba(16,185,129,0.2)', color: '#10B981', border: '1px solid rgba(16,185,129,0.4)'}}>
                            A
                          </span>
                          <div className="markdown text-sm text-slate-300 flex-1">
                            <ReactMarkdown>{pair.a}</ReactMarkdown>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )
            })()}

            {/* Sentiment */}
            {activeFeature === 'sentiment' && (
              <div>
                <div className="flex items-center gap-4 mb-6 p-4 rounded-xl"
                  style={{background: 'rgba(124,58,237,0.05)', border: '1px solid rgba(124,58,237,0.1)'}}>
                  <div className={`text-5xl font-black capitalize ${
                    result.sentiment === 'positive' ? 'text-emerald-400' :
                    result.sentiment === 'negative' ? 'text-red-400' : 'text-amber-400'
                  }`}>{result.sentiment}</div>
                  <div>
                    <div className="text-white font-bold">{(result.confidence * 100).toFixed(1)}%</div>
                    <div className="text-slate-500 text-xs">confidence</div>
                  </div>
                </div>
                {[
                  { label: 'Positive', value: result.positive_score, color: '#10B981' },
                  { label: 'Negative', value: result.negative_score, color: '#EF4444' },
                  { label: 'Neutral', value: result.neutral_score, color: '#F59E0B' },
                ].map(s => (
                  <div key={s.label} className="mb-4">
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-slate-400">{s.label}</span>
                      <span className="text-white font-bold">{(s.value * 100).toFixed(1)}%</span>
                    </div>
                    <div className="h-2.5 rounded-full overflow-hidden" style={{background: 'rgba(255,255,255,0.05)'}}>
                      <div className="h-full rounded-full transition-all duration-1000"
                        style={{width: `${s.value * 100}%`, background: s.color}} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* NER */}
            {activeFeature === 'ner' && (() => {
              const entityGroups = [
                { label: 'Persons', data: result.persons, color: '#7C3AED', bg: 'rgba(124,58,237,0.12)' },
                { label: 'Organizations', data: result.organizations, color: '#06B6D4', bg: 'rgba(6,182,212,0.12)' },
                { label: 'Locations', data: result.locations, color: '#10B981', bg: 'rgba(16,185,129,0.12)' },
                { label: 'Dates', data: result.dates, color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
                { label: 'Emails', data: result.emails, color: '#EC4899', bg: 'rgba(236,72,153,0.12)' },
              ]
              const nonEmpty = entityGroups.filter(e => e.data && e.data.length > 0)

              if (nonEmpty.length === 0) {
                return (
                  <div className="text-center py-8">
                    <Tag className="w-8 h-8 text-slate-700 mx-auto mb-3" />
                    <p className="text-slate-400 text-sm font-medium">No named entities detected</p>
                    <p className="text-slate-600 text-xs mt-1">
                      No confident persons, organizations, locations, dates, or emails were found in this document.
                    </p>
                  </div>
                )
              }

              return (
                <div className="space-y-5">
                  {nonEmpty.map(entity => (
                    <div key={entity.label}>
                      <p className="text-xs uppercase tracking-wider mb-3 font-semibold" style={{color: entity.color}}>
                        {entity.label} ({entity.data.length})
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {entity.data.map((item, i) => (
                          <span key={i} className="px-3 py-1.5 rounded-xl text-xs font-medium"
                            style={{background: entity.bg, color: entity.color, border: `1px solid ${entity.color}30`}}>
                            {item}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )
            })()}

            {/* Search */}
            {activeFeature === 'search' && (
              <div className="space-y-4">
                {!Array.isArray(result.results) || result.results.length === 0 ? (
                  <p className="text-slate-500 text-sm">No results found for this query.</p>
                ) : (
                  result.results.map((r, i) => {
                    const relevance = Math.max(0, r.relevance || 0) * 100
                    const label = relevanceLabel(relevance)
                    const cleaned = cleanChunk(r.chunk)
                    const isExpanded = !!expandedResults[i]
                    const isLong = cleaned.length > CHUNK_PREVIEW_LIMIT
                    const displayText = isExpanded || !isLong ? cleaned : cleaned.slice(0, CHUNK_PREVIEW_LIMIT) + '…'
                    const codeHeavy = isCodeHeavy(displayText)
                    return (
                      <div key={i} className="p-4 rounded-xl"
                        style={{background: 'rgba(16,185,129,0.05)', border: `1px solid ${label.color}25`}}>
                        <div className="flex justify-between items-center mb-3">
                          <span className="text-slate-500 text-xs font-medium">Result {i+1}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold" style={{color: label.color}}>{label.text}</span>
                            <div className="h-1.5 w-16 rounded-full overflow-hidden" style={{background: 'rgba(255,255,255,0.06)'}}>
                              <div className="h-full rounded-full" style={{width: `${relevance}%`, background: label.color}} />
                            </div>
                            <span className="text-xs font-bold" style={{color: label.color}}>{relevance.toFixed(0)}%</span>
                          </div>
                        </div>

                        {codeHeavy ? (
                          <pre className="text-xs text-white leading-relaxed whitespace-pre-wrap p-3 rounded-lg overflow-x-auto font-mono"
                            style={{background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(255,255,255,0.08)'}}>
                            {displayText}
                          </pre>
                        ) : (
                          <p className="text-slate-100 text-sm leading-relaxed whitespace-pre-line">
                            {displayText.split('\n').join(' ')}
                          </p>
                        )}

                        {isLong && (
                          <button
                            onClick={() => setExpandedResults(prev => ({ ...prev, [i]: !isExpanded }))}
                            className="mt-3 text-xs font-semibold"
                            style={{color: label.color}}
                          >
                            {isExpanded ? 'Show less' : 'Show full chunk'}
                          </button>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}