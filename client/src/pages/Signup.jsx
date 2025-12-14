import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import Header from '../components/Header'
import { useAuth } from '../contexts/AuthContext'
import { api } from '../utils/api'

export default function Signup() {
    const [name, setName] = useState('')
    const [username, setUsername] = useState('')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [usernameStatus, setUsernameStatus] = useState('')
    const [error, setError] = useState('')
    const [success, setSuccess] = useState('')
    const [loading, setLoading] = useState(false)
    const { register } = useAuth()
    const navigate = useNavigate()

    const handleSubmit = async (e) => {
        e.preventDefault()
        setError('')
        setSuccess('')

        if (password.length < 6) {
            setError('Password must be at least 8 characters')
            return
        }

        const uname = username.toLowerCase().trim()
        if (uname.length < 3 || uname.length > 20 || !/^[a-z0-9_.-]+$/.test(uname)) {
            setError('Username must be 3-20 chars, lowercase letters, numbers, underscores, dots or hyphens')
            return
        }

        setLoading(true)
        const result = await register(name, uname, email, password)
        setLoading(false)

        if (result.success) {
            setSuccess('Registration successful! Please check your email to verify your account.')
            localStorage.setItem('isLoggedIn', 'false')
        } else {
            setError(result.error || 'Registration failed')
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
                        <div className="text-center mb-6">
                            <h1 className="text-3xl font-bold">Create an Account</h1>
                            <p className="text-zinc-600 dark:text-brand-text-secondary">Join the hub and start collaborating</p>
                        </div>

                        {error && (
                            <div className="mb-6 p-3 bg-red-100 dark:bg-red-900/20 border border-red-400 dark:border-red-500 text-red-700 dark:text-red-400 rounded-xl text-sm">
                                {error}
                            </div>
                        )}

                        {success && (
                            <div className="mb-6 p-3 bg-green-100 dark:bg-green-900/20 border border-green-400 dark:border-green-500 text-green-700 dark:text-green-400 rounded-xl text-sm">
                                {success}
                            </div>
                        )}

                        <form className="space-y-6" onSubmit={handleSubmit}>
                            <div>
                                <label htmlFor="name" className="block text-sm font-medium text-zinc-700 dark:text-brand-text-secondary mb-2">Name</label>
                                <input
                                    type="text"
                                    id="name"
                                    name="name"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="e.g., Adrian Ward"
                                    className="w-full bg-zinc-100 dark:bg-brand-bg p-3 rounded-xl border border-zinc-300 dark:border-brand-border/50 focus:outline-none focus:ring-2 focus:ring-brand-accent-purple transition"
                                    required
                                />
                            </div>

                            <div>
                                <label htmlFor="username" className="block text-sm font-medium text-zinc-700 dark:text-brand-text-secondary mb-2">Username</label>
                                <input
                                    type="text"
                                    id="username"
                                    name="username"
                                    value={username}
                                    onChange={async (e) => {
                                        const val = e.target.value
                                        setUsername(val)
                                        setUsernameStatus('')
                                        const clean = val.toLowerCase().trim()
                                        if (clean.length >= 3 && /^[a-z0-9_.-]+$/.test(clean)) {
                                            try {
                                                const res = await api.checkUsername(clean)
                                                setUsernameStatus(res.available ? 'available' : 'taken')
                                            } catch (err) {
                                                setUsernameStatus('invalid')
                                            }
                                        }
                                    }}
                                    placeholder="e.g., adrian_ward"
                                    className="w-full bg-zinc-100 dark:bg-brand-bg p-3 rounded-xl border border-zinc-300 dark:border-brand-border/50 focus:outline-none focus:ring-2 focus:ring-brand-accent-purple transition"
                                    required
                                />
                                {usernameStatus === 'available' && (
                                    <p className="mt-1 text-xs text-green-600">Username is available</p>
                                )}
                                {usernameStatus === 'taken' && (
                                    <p className="mt-1 text-xs text-red-600">Username is already taken</p>
                                )}
                                {usernameStatus === 'invalid' && (
                                    <p className="mt-1 text-xs text-red-600">Could not validate username</p>
                                )}
                                <p className="mt-1 text-xs text-zinc-500 dark:text-brand-text-secondary">3-20 chars, lowercase letters, numbers, underscores, dots and hyphens</p>
                            </div>

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
                                <label htmlFor="password" className="block text-sm font-medium text-zinc-700 dark:text-brand-text-secondary mb-2">Password</label>
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
                                        minLength={6}
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
                                <p className="mt-1 text-xs text-zinc-500 dark:text-brand-text-secondary">At least 8 characters</p>
                            </div>

                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full font-bold text-white bg-gradient-to-r from-brand-accent-purple to-brand-accent-pink py-3 rounded-xl transition-transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {loading ? 'Creating Account...' : 'Create Account'}
                            </button>
                        </form>

                        <div className="mt-6 text-center">
                            <p className="text-sm text-zinc-600 dark:text-brand-text-secondary">Already have an account? <Link to="/login" className="font-semibold text-brand-accent-blue hover:underline">Sign In</Link></p>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    )
}
