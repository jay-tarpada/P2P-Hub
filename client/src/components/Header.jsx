import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function Header() {
    const [isLoggedIn, setIsLoggedIn] = useState(localStorage.getItem('isLoggedIn') === 'true');
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const { logout } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        // Listen for localStorage changes from other tabs
        const handleStorage = () => {
            setIsLoggedIn(localStorage.getItem('isLoggedIn') === 'true');
        };
        window.addEventListener('storage', handleStorage);
        // Poll localStorage every 500ms for changes in the same tab
        const interval = setInterval(() => {
            setIsLoggedIn(localStorage.getItem('isLoggedIn') === 'true');
        }, 500);
        return () => {
            window.removeEventListener('storage', handleStorage);
            clearInterval(interval);
        };
    }, []);

    // If you have login/logout logic elsewhere, also call setIsLoggedIn after login/logout
    // Example: setIsLoggedIn(true) after login, setIsLoggedIn(false) after logout

    useEffect(() => {
        const themeToggleBtn = document.getElementById('theme-toggle')
        const themeToggleDarkIcon = document.getElementById('theme-toggle-dark-icon')
        const themeToggleLightIcon = document.getElementById('theme-toggle-light-icon')

        const applyTheme = (theme) => {
            if (theme === 'dark') {
                document.documentElement.classList.add('dark')
                themeToggleLightIcon?.classList.remove('hidden')
                themeToggleDarkIcon?.classList.add('hidden')
                localStorage.setItem('theme', 'dark')
            } else {
                document.documentElement.classList.remove('dark')
                themeToggleLightIcon?.classList.add('hidden')
                themeToggleDarkIcon?.classList.remove('hidden')
                localStorage.setItem('theme', 'light')
            }
        }

        const savedTheme = localStorage.getItem('theme')
        const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
        if (savedTheme) applyTheme(savedTheme)
        else applyTheme(prefersDark ? 'dark' : 'light')

        const handler = () => {
            const isDarkMode = document.documentElement.classList.contains('dark')
            applyTheme(isDarkMode ? 'light' : 'dark')
        }

        themeToggleBtn?.addEventListener('click', handler)
        return () => themeToggleBtn?.removeEventListener('click', handler)
    }, [])

    const handleLogout = async () => {
        await logout();
        localStorage.setItem('isLoggedIn', 'false');
        setIsLoggedIn(false);
        navigate('/');
    };

    return (
        <header className="sticky top-0 left-0 right-0 z-50 bg-white/80 dark:bg-brand-bg/80 backdrop-blur-sm border-b border-zinc-200/50 dark:border-brand-border/50">
            <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center h-20">
                    <div className="flex items-center gap-6 text-2xl font-bold flex-shrink-0">
                        <Link to="/" className="flex items-center gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-brand-accent-purple"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></svg>
                            P2P Hub
                        </Link>
                    </div>
                    {/* Desktop navigation perfectly centered */}
                    <div className="hidden md:flex items-center gap-8 font-medium absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2">
                        <Link to="/" className="hover:text-brand-accent-purple transition-colors">Home</Link>
                        {isLoggedIn && <Link to="/dashboard" className="hover:text-brand-accent-purple transition-colors">Dashboard</Link>}
                        <Link to="/about" className="hover:text-brand-accent-purple transition-colors">About</Link>
                        <Link to="/contact" className="hover:text-brand-accent-purple transition-colors">Contact</Link>
                    </div>
                    <div className="flex items-center gap-4 md:gap-4 flex-shrink-0 ml-auto">
                        <button id="theme-toggle" type="button" className="text-zinc-500 dark:text-brand-text-secondary hover:bg-zinc-100 dark:hover:bg-brand-surface p-2 rounded-lg transition-colors">
                            <svg id="theme-toggle-dark-icon" className="hidden w-5 h-5" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z"></path></svg>
                            <svg id="theme-toggle-light-icon" className="hidden w-5 h-5" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.707.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 100 2h1z" fillRule="evenodd" clipRule="evenodd"></path></svg>
                        </button>
                        {isLoggedIn && (
                            <button
                                onClick={handleLogout}
                                className="font-medium text-sm text-zinc-600 dark:text-brand-text-secondary hover:text-zinc-900 dark:hover:text-brand-text-primary transition-colors flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-brand-surface"
                                title="Logout"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                </svg>
                                <span className="hidden sm:inline">Logout</span>
                            </button>
                        )}
                        {!isLoggedIn && <Link to="/login" className="font-medium text-sm text-zinc-600 dark:text-brand-text-secondary hover:text-zinc-900 dark:hover:text-brand-text-primary transition-colors">Log In</Link>}
                        {!isLoggedIn && <Link to="/signup" className="font-bold text-sm bg-gradient-to-r from-brand-accent-purple to-brand-accent-pink text-white px-5 py-2.5 rounded-xl transition-transform hover:scale-105">Sign Up Free</Link>}
                        {/* Hamburger for mobile - now at right */}
                        <div className="md:hidden flex items-center ml-2">
                            <button
                                type="button"
                                className="inline-flex items-center justify-center p-2 rounded-md text-zinc-500 dark:text-brand-text-secondary hover:bg-zinc-100 dark:hover:bg-brand-surface focus:outline-none"
                                aria-label="Open main menu"
                                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                            >
                                <svg className="h-6 w-6" stroke="currentColor" fill="none" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
                {/* Mobile menu dropdown */}
                {mobileMenuOpen && (
                    <div className="md:hidden absolute left-0 right-0 top-20 bg-white dark:bg-brand-bg border-b border-zinc-200 dark:border-brand-border shadow-lg z-40">
                        <div className="flex flex-col items-start gap-4 p-6 font-medium">
                            <Link to="/" className="w-full py-2 hover:text-brand-accent-purple transition-colors" onClick={() => setMobileMenuOpen(false)}>Home</Link>
                            {isLoggedIn && <Link to="/dashboard" className="w-full py-2 hover:text-brand-accent-purple transition-colors" onClick={() => setMobileMenuOpen(false)}>Dashboard</Link>}
                            <Link to="/about" className="w-full py-2 hover:text-brand-accent-purple transition-colors" onClick={() => setMobileMenuOpen(false)}>About</Link>
                            <Link to="/contact" className="w-full py-2 hover:text-brand-accent-purple transition-colors" onClick={() => setMobileMenuOpen(false)}>Contact</Link>
                            {isLoggedIn && (
                                <button
                                    onClick={() => { handleLogout(); setMobileMenuOpen(false); }}
                                    className="w-full py-2 text-left hover:text-brand-accent-purple transition-colors flex items-center gap-2"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                    </svg>
                                    Logout
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </nav>
        </header>
    )
}
