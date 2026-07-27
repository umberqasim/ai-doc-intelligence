import { useState } from 'react'
import { authAPI } from '../services/api'
import toast from 'react-hot-toast'
import { Brain, Mail, Lock, LogIn, Sparkles } from 'lucide-react'

export default function Login({ onLogin, onSwitch }) {
  const [form, setForm] = useState({ email: '', password: '' })
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await authAPI.login(form)
      toast.success('Welcome back! 🎉')
      onLogin(res.data.access_token)
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{background: 'radial-gradient(ellipse at top left, #1a0533 0%, #080B14 40%, #0a1628 100%)'}}>

      {/* Animated background orbs */}
      <div className="absolute top-20 left-20 w-72 h-72 rounded-full opacity-20 animate-float"
        style={{background: 'radial-gradient(circle, #7C3AED, transparent)', filter: 'blur(40px)'}} />
      <div className="absolute bottom-20 right-20 w-96 h-96 rounded-full opacity-10 animate-float"
        style={{background: 'radial-gradient(circle, #06B6D4, transparent)', filter: 'blur(60px)', animationDelay: '1s'}} />
      <div className="absolute top-1/2 left-1/2 w-64 h-64 rounded-full opacity-10 animate-float"
        style={{background: 'radial-gradient(circle, #EC4899, transparent)', filter: 'blur(50px)', animationDelay: '2s'}} />

      <div className="w-full max-w-md px-4 animate-fadeIn relative z-10">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-4 animate-pulse-glow"
            style={{background: 'linear-gradient(135deg, #7C3AED, #06B6D4)'}}>
            <Brain className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-black gradient-text mb-2">AI Doc Intelligence</h1>
          <p className="text-slate-400 text-sm">Your documents, supercharged with AI</p>
        </div>

        {/* Card */}
        <div className="glass rounded-3xl p-8 neon-border">
          <div className="flex items-center gap-2 mb-6">
            <Sparkles className="w-5 h-5 text-purple-400" />
            <h2 className="text-white font-bold text-lg">Sign In</h2>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-slate-300 text-sm font-medium mb-2 block">Email Address</label>
              <div className="relative group">
                <Mail className="absolute left-4 top-3.5 w-4 h-4 text-purple-400 transition-all group-focus-within:text-purple-300" />
                <input
                  type="email"
                  placeholder="you@example.com"
                  className="w-full pl-11 pr-4 py-3.5 rounded-xl text-white text-sm placeholder-slate-500 focus:outline-none transition-all duration-300"
                  style={{background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.2)'}}
                  onFocus={e => e.target.style.border = '1px solid rgba(124,58,237,0.6)'}
                  onBlur={e => e.target.style.border = '1px solid rgba(124,58,237,0.2)'}
                  value={form.email}
                  onChange={e => setForm({...form, email: e.target.value})}
                  required
                />
              </div>
            </div>

            <div>
              <label className="text-slate-300 text-sm font-medium mb-2 block">Password</label>
              <div className="relative group">
                <Lock className="absolute left-4 top-3.5 w-4 h-4 text-purple-400" />
                <input
                  type="password"
                  placeholder="••••••••"
                  className="w-full pl-11 pr-4 py-3.5 rounded-xl text-white text-sm placeholder-slate-500 focus:outline-none transition-all duration-300"
                  style={{background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.2)'}}
                  onFocus={e => e.target.style.border = '1px solid rgba(124,58,237,0.6)'}
                  onBlur={e => e.target.style.border = '1px solid rgba(124,58,237,0.2)'}
                  value={form.password}
                  onChange={e => setForm({...form, password: e.target.value})}
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 btn-primary text-white font-bold rounded-xl flex items-center justify-center gap-2 mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <><LogIn className="w-4 h-4" /> Sign In</>
              )}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-purple-900/30 text-center">
            <p className="text-slate-500 text-sm">
              No account yet?{' '}
              <button onClick={onSwitch} className="text-purple-400 hover:text-purple-300 font-semibold transition-colors">
                Create one free →
              </button>
            </p>
          </div>
        </div>

        <p className="text-center text-slate-600 text-xs mt-6">
          Powered by Groq AI • ChromaDB • FastAPI
        </p>
      </div>
    </div>
  )
}