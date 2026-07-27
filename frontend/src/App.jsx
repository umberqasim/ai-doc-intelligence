import { useState, useEffect } from 'react'
import { Toaster } from 'react-hot-toast'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import './index.css'

function App() {
  const [page, setPage] = useState('login')
  const [token, setToken] = useState(localStorage.getItem('token'))

  useEffect(() => {
    if (token) setPage('dashboard')
    else setPage('login')
  }, [token])

  const handleLogin = (newToken) => {
    localStorage.setItem('token', newToken)
    setToken(newToken)
    setPage('dashboard')
  }

  const handleLogout = () => {
    localStorage.removeItem('token')
    setToken(null)
    setPage('login')
  }

  return (
    <div className="min-h-screen bg-slate-900">
      <Toaster position="top-center" toastOptions={{
        duration: 4000,
        style: {
          background: '#1e293b',
          color: '#f1f5f9',
          border: '1px solid #334155',
          fontSize: '14px',
          padding: '12px 16px',
          borderRadius: '10px',
          boxShadow: '0 8px 24px -4px rgba(0,0,0,0.5)'
        }
      }} />
      {page === 'login' && <Login onLogin={handleLogin} onSwitch={() => setPage('register')} />}
      {page === 'register' && <Register onRegister={handleLogin} onSwitch={() => setPage('login')} />}
      {page === 'dashboard' && <Dashboard onLogout={handleLogout} />}
    </div>
  )
}

export default App
