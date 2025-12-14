import React, { useState } from 'react'
import DashboardHeader from '../components/DashboardHeader'
import FriendsList from '../components/FriendsList'
import ChatWindow from '../components/ChatWindow'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'

export default function Dashboard() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [selectedFriend, setSelectedFriend] = useState(null);
    const [activeTab, setActiveTab] = useState('chat');

    // Initialize theme on mount
    React.useEffect(() => {
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'dark') {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }, []);

    // File transfer is now independent on /transfer

    return (
        <div className="min-h-screen bg-gradient-to-br from-zinc-50 via-zinc-100 to-zinc-200 dark:from-zinc-900 dark:via-brand-bg dark:to-zinc-950 text-zinc-900 dark:text-brand-text-primary font-sans antialiased transition-colors duration-300 relative">
            {/* Elegant Background Gradients */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none" style={{ zIndex: 0 }}>
                {/* Top gradient orb */}
                <div className="absolute w-96 h-96 bg-gradient-to-br from-purple-400/30 to-pink-400/30 dark:from-purple-600/20 dark:to-pink-600/20 rounded-full blur-3xl" style={{ top: '-5%', right: '10%' }} />
                {/* Bottom left gradient */}
                <div className="absolute w-[500px] h-[500px] bg-gradient-to-tr from-blue-400/20 to-purple-400/20 dark:from-blue-600/15 dark:to-purple-600/15 rounded-full blur-3xl" style={{ bottom: '-10%', left: '-5%' }} />
                {/* Center accent */}
                <div className="absolute w-80 h-80 bg-gradient-to-br from-pink-300/25 to-orange-300/25 dark:from-pink-500/15 dark:to-orange-500/15 rounded-full blur-3xl" style={{ top: '40%', left: '50%', transform: 'translateX(-50%)' }} />
            </div>

            <div className="relative">
                <DashboardHeader onToggleTheme={() => {
                    const isDark = document.documentElement.classList.contains('dark');
                    document.documentElement.classList.toggle('dark', !isDark);
                    localStorage.setItem('theme', !isDark ? 'dark' : 'light');
                }} />
            </div>

            {/* App Bar with Tabs - Compact & Sticky */}
            <div className="sticky top-[68px] z-20 flex justify-center py-3">
                <div className="inline-flex items-center gap-1.5 p-1.5 bg-white/70 dark:bg-brand-surface/70 backdrop-blur-xl rounded-full border border-zinc-200/50 dark:border-brand-border/30 shadow-lg shadow-zinc-900/5 dark:shadow-zinc-950/30">
                    {/* Chat Tab */}
                    <button
                        onClick={() => setActiveTab('chat')}
                        className={`group relative flex items-center gap-2 px-4 py-2 rounded-full font-medium text-sm transition-all duration-200 ${activeTab === 'chat'
                            ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-md'
                            : 'bg-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                            }`}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                        </svg>
                        <span className="hidden sm:inline">Chat</span>
                        {/* Tooltip for mobile */}
                        <span className="sm:hidden absolute -bottom-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-zinc-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                            Chat
                        </span>
                    </button>

                    {/* File Transfer Tab */}
                    <button
                        onClick={() => navigate('/transfer')}
                        className={`group relative flex items-center gap-2 px-4 py-2 rounded-full font-medium text-sm transition-all duration-200 ${activeTab === 'file-transfer'
                            ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-md'
                            : 'bg-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                            }`}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="17 8 12 3 7 8" />
                            <line x1="12" y1="3" x2="12" y2="15" />
                        </svg>
                        <span className="hidden sm:inline">Transfer</span>
                        {/* Tooltip for mobile */}
                        <span className="sm:hidden absolute -bottom-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-zinc-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                            Transfer
                        </span>
                    </button>

                    {/* Notes Tab */}
                    <button
                        onClick={() => navigate('/dashboard/notes')}
                        className={`group relative flex items-center gap-2 px-4 py-2 rounded-full font-medium text-sm transition-all duration-200 ${activeTab === 'notes'
                            ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-md'
                            : 'bg-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                            }`}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                            <polyline points="14 2 14 8 20 8"></polyline>
                            <line x1="16" y1="13" x2="8" y2="13"></line>
                            <line x1="16" y1="17" x2="8" y2="17"></line>
                            <polyline points="10 9 9 9 8 9"></polyline>
                        </svg>
                        <span className="hidden sm:inline">Notes</span>
                        {/* Tooltip for mobile */}
                        <span className="sm:hidden absolute -bottom-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-zinc-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                            Notes
                        </span>
                    </button>
                </div>
            </div>

            <main className="relative z-10 w-full max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-5 gap-8 pt-4 pb-8 px-4 sm:px-6 lg:px-8">
                <div className="lg:col-span-2 flex flex-col gap-8">
                    <FriendsList onChat={friend => setSelectedFriend(friend)} />
                </div>
                <div className="lg:col-span-3 flex flex-col gap-8">
                    {selectedFriend ? (
                        <ChatWindow user={user} friend={selectedFriend} />
                    ) : (
                        <div className="bg-white/70 dark:bg-brand-surface/70 backdrop-blur-xl p-12 rounded-2xl border border-zinc-200/50 dark:border-brand-border/30 shadow-xl flex flex-col items-center justify-center h-full min-h-[500px] relative overflow-hidden">
                            {/* Decorative gradient orbs */}
                            <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-purple-400/10 to-pink-400/10 dark:from-purple-500/5 dark:to-pink-500/5 rounded-full blur-3xl"></div>
                            <div className="absolute bottom-0 left-0 w-64 h-64 bg-gradient-to-tr from-blue-400/10 to-purple-400/10 dark:from-blue-500/5 dark:to-purple-500/5 rounded-full blur-3xl"></div>

                            {/* Content */}
                            <div className="relative z-10 flex flex-col items-center text-center max-w-md">
                                {/* Animated icon */}
                                <div className="mb-6 relative">
                                    <div className="absolute inset-0 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full blur-xl opacity-30 animate-pulse"></div>
                                    <div className="relative bg-gradient-to-br from-purple-500 to-pink-500 p-6 rounded-full shadow-lg">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                                            <path d="M8 10h.01" />
                                            <path d="M12 10h.01" />
                                            <path d="M16 10h.01" />
                                        </svg>
                                    </div>
                                </div>

                                {/* Text */}
                                <h3 className="text-2xl font-bold text-zinc-800 dark:text-white mb-3 bg-gradient-to-r from-purple-600 to-pink-600 dark:from-purple-400 dark:to-pink-400 bg-clip-text text-transparent">
                                    Start a Conversation
                                </h3>
                                <p className="text-zinc-600 dark:text-zinc-400 mb-6 leading-relaxed">
                                    Select a friend from the list to begin chatting. Share messages, ideas, and stay connected!
                                </p>

                                {/* Helpful tip */}
                                <div className="flex items-center gap-2 px-4 py-2 bg-purple-50 dark:bg-purple-900/20 rounded-full text-sm text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800/50">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <circle cx="12" cy="12" r="10"></circle>
                                        <path d="M12 16v-4"></path>
                                        <path d="M12 8h.01"></path>
                                    </svg>
                                    <span>Click on a friend to get started</span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
