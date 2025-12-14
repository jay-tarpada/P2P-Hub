import React, { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import Header from '../components/Header'

export default function ResetPassword() {
    const { token } = useParams()
    const navigate = useNavigate()
    const [password, setPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [showConfirmPassword, setShowConfirmPassword] = useState(false)
    const [error, setError] = useState('')
    const [success, setSuccess] = useState('')
    const [loading, setLoading] = useState(false)

    const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

    const handleSubmit = async (e) => {
        e.preventDefault()
        setError('')
        setSuccess('')

        if (password !== confirmPassword) {
            setError('Passwords do not match')
            return
        }

        if (password.length < 8) {
            setError('Password must be at least 8 characters long')
            return
        }

        setLoading(true)

        try {
            const response = await fetch(`${API_BASE}/api/auth/reset-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, newPassword: password })
            })

            const data = await response.json()

            if (response.ok) {
                setSuccess(data.message)
                setTimeout(() => {
                    navigate('/login')
                }, 3000)
            } else {
                setError(data.error || 'Failed to reset password')
            }
        } catch (err) {
            setError('Network error. Please try again.')
        } finally {
            setLoading(false)
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
                            <h1 className="text-3xl font-bold">Reset Password</h1>
                            <p className="text-zinc-600 dark:text-brand-text-secondary">Enter your new password</p>
                        </div>

                        {error && (
                            <div className="mb-6 p-3 bg-red-100 dark:bg-red-900/20 border border-red-400 dark:border-red-500 text-red-700 dark:text-red-400 rounded-xl text-sm">
                                {error}
                            </div>
                        )}

                        {success && (
                            <div className="mb-6 p-3 bg-green-100 dark:bg-green-900/20 border border-green-400 dark:border-green-500 text-green-700 dark:text-green-400 rounded-xl text-sm">
                                {success}
                                <p className="mt-2">Redirecting to login...</p>
                            </div>
                        )}

                        <form className="space-y-6" onSubmit={handleSubmit}>
                            <div>
                                <label htmlFor="password" className="block text-sm font-medium text-zinc-700 dark:text-brand-text-secondary mb-2">New Password</label>
                                <div className="relative">
                                    <input
                                        type={showPassword ? "text" : "password"}
                                        id="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder="••••••••"
                                        className="w-full bg-zinc-100 dark:bg-brand-bg p-3 pr-12 rounded-xl border border-zinc-300 dark:border-brand-border/50 focus:outline-none focus:ring-2 focus:ring-brand-accent-purple transition"
                                        required
                                        minLength={8}
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
                                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                                    Must be at least 8 characters with uppercase, lowercase, number, and special character
                                </p>
                            </div>

                            <div>
                                <label htmlFor="confirmPassword" className="block text-sm font-medium text-zinc-700 dark:text-brand-text-secondary mb-2">Confirm Password</label>
                                <div className="relative">
                                    <input
                                        type={showConfirmPassword ? "text" : "password"}
                                        id="confirmPassword"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        placeholder="••••••••"
                                        className="w-full bg-zinc-100 dark:bg-brand-bg p-3 pr-12 rounded-xl border border-zinc-300 dark:border-brand-border/50 focus:outline-none focus:ring-2 focus:ring-brand-accent-purple transition"
                                        required
                                        minLength={8}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors"
                                        aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                                    >
                                        {showConfirmPassword ? (
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
                                disabled={loading || success}
                                className="w-full font-bold text-white bg-gradient-to-r from-brand-accent-purple to-brand-accent-pink py-3 rounded-xl transition-transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {loading ? 'Resetting...' : success ? 'Success!' : 'Reset Password'}
                            </button>
                        </form>

                        <div className="mt-8 text-center">
                            <p className="text-sm text-zinc-600 dark:text-brand-text-secondary">
                                Remember your password? <Link to="/login" className="font-semibold text-brand-accent-blue hover:underline">Sign In</Link>
                            </p>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    )
}
