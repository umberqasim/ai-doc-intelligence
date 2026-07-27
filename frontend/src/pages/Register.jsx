import { useState } from 'react'
import { authAPI } from '../services/api'
import toast from 'react-hot-toast'
import { Brain, Mail, Lock, User, UserPlus, Sparkles } from 'lucide-react'

export default function Register({ onRegister, onSwitch }) {
  const [form, setForm] = useState({ full_name: '', email: '', password: '' })
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      await authAPI.register(form)
      const res = await authAPI.login({ email: form.email, password: form.password })
      toast.success('Welcome aboard! 🚀')
      onRegister(res.data.access_token)
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  const inputStyle = {
    background: 'rgba(124,58,237,0.08)',
    border: '1px solid rgba(124,58,237,0.2)'
  }

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{background: 'radial-gradient(ellipse at bottom right, #0a1628 0%, #080B14 40%, #1a0533 100%)'}}>

      <div className="absolute top-20 right-20 w-72 h-72 rounded-full opacity-20 animate-float"
        style={{background: 'radial-gradient(circle, #06B6D4, transparent)', filter: 'blur(40px)'}} />
      <div className="absolute bottom-20 left-20 w-96 h-96 rounded-full opacity-10 animate-float"
        style={{background: 'radial-gradient(circle, #7C3AED, transparent)', filter: 'blur(60px)', animationDelay: '1.5s'}} />

      <div className="w-full max-w-md px-4 animate-fadeIn relative z-10">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-4 animate-pulse-glow"
            style={{background: 'linear-gradient(135deg, #06B6D4, #7C3AED)'}}>
            <Brain className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-black gradient-text mb-2">Create Account</h1>
          <p className="text-slate-400 text-sm">Start chatting with your documents today</p>
        </div>

        <div className="glass rounded-3xl p-8 neon-border">
          <div className="flex items-center gap-2 mb-6">
            <Sparkles className="w-5 h-5 text-cyan-400" />
            <h2 className="text-white font-bold text-lg">Get Started Free</h2>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {[
              { label: 'Full Name', key: 'full_name', type: 'text', placeholder: 'Umber Qasim', Icon: User },
              { label: 'Email Address', key: 'email', type: 'email', placeholder: 'you@example.com', Icon: Mail },
              { label: 'Password', key: 'password', type: 'password', placeholder: '••••••••', Icon: Lock },
            ].map(({ label, key, type, placeholder, Icon }) => (
              <div key={key}>
                <label className="text-slate-300 text-sm font-medium mb-2 block">{label}</label>
                <div className="relative">
                  <Icon className="absolute left-4 top-3.5 w-4 h-4 text-purple-400" />
                  <input
                    type={type}
                    placeholder={placeholder}
                    className="w-full pl-11 pr-4 py-3.5 rounded-xl text-white text-sm placeholder-slate-500 focus:outline-none transition-all duration-300"
                    style={inputStyle}
                    onFocus={e => e.target.style.border = '1px solid rgba(124,58,237,0.6)'}
                    onBlur={e => e.target.style.border = '1px solid rgba(124,58,237,0.2)'}
                    value={form[key]}
                    onChange={e => setForm({...form, [key]: e.target.value})}
                    required
                  />
                </div>
              </div>
            ))}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 btn-primary text-white font-bold rounded-xl flex items-center justify-center gap-2 mt-2 disabled:opacity-50"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <><UserPlus className="w-4 h-4" /> Create Account</>
              )}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-purple-900/30 text-center">
            <p className="text-slate-500 text-sm">
              Already have an account?{' '}
              <button onClick={onSwitch} className="text-purple-400 hover:text-purple-300 font-semibold transition-colors">
                Sign in →
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}