import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import Header from '../components/Header'
import { useAuth } from '../contexts/AuthContext'

export default function Login() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)
    const [showForgotPassword, setShowForgotPassword] = useState(false)
    const [forgotEmail, setForgotEmail] = useState('')
    const [forgotMessage, setForgotMessage] = useState('')
    const [forgotError, setForgotError] = useState('')
    const [forgotLoading, setForgotLoading] = useState(false)
    const { login } = useAuth()
    const navigate = useNavigate()

    const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

    const handleSubmit = async (e) => {
        e.preventDefault()
        setError('')
        setLoading(true)

        const result = await login(email, password)
        setLoading(false)

        if (result.success) {
            localStorage.setItem('isLoggedIn', 'true')
            navigate('/dashboard')
        } else {
            setError(result.error || 'Login failed')
        }
    }

    const handleForgotPassword = async (e) => {
        e.preventDefault()
        setForgotError('')
        setForgotMessage('')
        setForgotLoading(true)

        try {
            const response = await fetch(`${API_BASE}/api/auth/forgot-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: forgotEmail })
            })

            const data = await response.json()

            if (response.ok) {
                setForgotMessage(data.message)
                setForgotEmail('')
            } else {
                setForgotError(data.error || 'Failed to send reset email')
            }
        } catch (err) {
            setForgotError('Network error. Please try again.')
        } finally {
            setForgotLoading(false)
        }
    }

    return (
        <div className="min-h-screen text-zinc-900 dark:text-brand-text-primary font-sans antialiased overflow-hidden relative bg-white dark:bg-brand-bg">

            {/* Background shapes */}
            <div className="fixed inset-0 z-0 pointer-events-none">
                <div className="absolute rounded-full blur-[120px] bg-brand-accent-blue/80 opacity-80 dark:bg-brand-accent-blue/25 dark:opacity-25" style={{ width: 420, height: 420, top: '8%', left: '12%' }} />
                <div className="absolute rounded-full blur-[100px] bg-brand-accent-pink/70 opacity-70 dark:bg-brand-accent-pink/22 dark:opacity-22" style={{ width: 360, height: 360, top: '48%', left: '58%' }} />
                <div className="absolute rounded-full blur-[110px] bg-brand-accent-purple/65 opacity-65 dark:bg-brand-accent-purple/30 dark:opacity-30" style={{ width: 500, height: 500, top: '28%', left: '72%' }} />
            </div>

            <Header />

            <main className="min-h-[calc(100vh-5rem)] pt-24 flex items-center justify-center p-6 relative z-10">
                <div className="w-full mx-auto flex items-center justify-center">
                    <div className="w-full max-w-md sm:max-w-md md:max-w-lg lg:max-w-xl glass-effect p-10 md:p-12 rounded-3xl bg-white/95 dark:bg-brand-surface border border-zinc-200 dark:border-brand-border shadow-2xl">
                        <div className="text-center mb-8">
                            <h1 className="text-3xl font-bold">Welcome Back</h1>
                            <p className="text-zinc-600 dark:text-brand-text-secondary">Sign in to continue your session</p>
                        </div>

                        {error && (
                            <div className="mb-6 p-3 bg-red-100 dark:bg-red-900/20 border border-red-400 dark:border-red-500 text-red-700 dark:text-red-400 rounded-xl text-sm">
                                {error}
                            </div>
                        )}

                        <form className="space-y-6" onSubmit={handleSubmit}>
                            <div>
                                <label htmlFor="email" className="block text-sm font-medium text-zinc-700 dark:text-brand-text-secondary mb-2">Email</label>
                                <input
                                    type="email"
                                    id="email"
                                    name="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="you@example.com"
                                    className="w-full bg-zinc-100 dark:bg-brand-bg p-3 rounded-xl border border-zinc-300 dark:border-brand-border/50 focus:outline-none focus:ring-2 focus:ring-brand-accent-purple transition"
                                    required
                                />
                            </div>

                            <div>
                                <div className="flex justify-between items-center mb-2">
                                    <label htmlFor="password" className="block text-sm font-medium text-zinc-700 dark:text-brand-text-secondary">Password</label>
                                    <button
                                        type="button"
                                        onClick={() => setShowForgotPassword(true)}
                                        className="text-sm text-brand-accent-blue hover:underline"
                                    >
                                        Forgot?
                                    </button>
                                </div>
                                <div className="relative">
                                    <input
                                        type={showPassword ? "text" : "password"}
                                        id="password"
                                        name="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder="••••••••"
                                        className="w-full bg-zinc-100 dark:bg-brand-bg p-3 pr-12 rounded-xl border border-zinc-300 dark:border-brand-border/50 focus:outline-none focus:ring-2 focus:ring-brand-accent-purple transition"
                                        required
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors"
                                        aria-label={showPassword ? "Hide password" : "Show password"}
                                    >
                                        {showPassword ? (
                                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                                                <line x1="1" y1="1" x2="23" y2="23"></line>
                                            </svg>
                                        ) : (
                                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                                <circle cx="12" cy="12" r="3"></circle>
                                            </svg>
                                        )}
                                    </button>
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full font-bold text-white bg-gradient-to-r from-brand-accent-purple to-brand-accent-pink py-3 rounded-xl transition-transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {loading ? 'Signing in...' : 'Sign In'}
                            </button>
                        </form>

                        <div className="mt-8 text-center">
                            <p className="text-sm text-zinc-600 dark:text-brand-text-secondary">Don't have an account? <Link to="/signup" className="font-semibold text-brand-accent-blue hover:underline">Sign Up</Link></p>
                        </div>
                    </div>
                </div>
            </main>

            {/* Forgot Password Modal */}
            {showForgotPassword && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="w-full max-w-md bg-white dark:bg-brand-surface border border-zinc-200 dark:border-brand-border rounded-2xl p-8 shadow-2xl">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-2xl font-bold">Forgot Password?</h2>
                            <button
                                onClick={() => {
                                    setShowForgotPassword(false);
                                    setForgotEmail('');
                                    setForgotMessage('');
                                    setForgotError('');
                                }}
                                className="text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                            >
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <p className="text-sm text-zinc-600 dark:text-brand-text-secondary mb-6">
                            Enter your email address and we'll send you a link to reset your password.
                        </p>

                        {forgotMessage && (
                            <div className="mb-4 p-3 bg-green-100 dark:bg-green-900/20 border border-green-400 dark:border-green-500 text-green-700 dark:text-green-400 rounded-xl text-sm">
                                {forgotMessage}
                            </div>
                        )}

                        {forgotError && (
                            <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/20 border border-red-400 dark:border-red-500 text-red-700 dark:text-red-400 rounded-xl text-sm">
                                {forgotError}
                            </div>
                        )}

                        <form onSubmit={handleForgotPassword} className="space-y-4">
                            <div>
                                <label htmlFor="forgot-email" className="block text-sm font-medium text-zinc-700 dark:text-brand-text-secondary mb-2">
                                    Email Address
                                </label>
                                <input
                                    type="email"
                                    id="forgot-email"
                                    value={forgotEmail}
                                    onChange={(e) => setForgotEmail(e.target.value)}
                                    placeholder="you@example.com"
                                    className="w-full bg-zinc-100 dark:bg-brand-bg p-3 rounded-xl border border-zinc-300 dark:border-brand-border/50 focus:outline-none focus:ring-2 focus:ring-brand-accent-purple transition"
                                    required
                                />
                            </div>

                            <div className="flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowForgotPassword(false);
                                        setForgotEmail('');
                                        setForgotMessage('');
                                        setForgotError('');
                                    }}
                                    className="flex-1 py-3 rounded-xl border border-zinc-300 dark:border-brand-border hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={forgotLoading}
                                    className="flex-1 font-bold text-white bg-gradient-to-r from-brand-accent-purple to-brand-accent-pink py-3 rounded-xl transition-transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {forgotLoading ? 'Sending...' : 'Send Reset Link'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
