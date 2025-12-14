import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../utils/api';
import DashboardHeader from '../components/DashboardHeader';

export default function NotesPage() {
    const [notes, setNotes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const navigate = useNavigate();

    useEffect(() => {
        loadNotes();
    }, []);

    const loadNotes = async () => {
        try {
            setLoading(true);
            const data = await api.getNotes();
            setNotes(data.notes || []);
        } catch (err) {
            setError(err.message || 'Failed to load notes');
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteNote = async (id, title) => {
        if (!confirm(`Are you sure you want to delete "${title}"?`)) return;

        try {
            await api.deleteNote(id);
            setNotes(notes.filter(n => n._id !== id));
        } catch (err) {
            alert(err.message || 'Failed to delete note');
        }
    };

    const filteredNotes = notes.filter(note =>
        note.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        note.slug.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const formatDate = (date) => {
        const now = new Date();
        const noteDate = new Date(date);
        const diffMs = now - noteDate;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return noteDate.toLocaleDateString();
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-zinc-50 via-zinc-100 to-zinc-200 dark:from-zinc-900 dark:via-brand-bg dark:to-zinc-950 text-zinc-900 dark:text-brand-text-primary font-sans antialiased transition-colors duration-300 relative">
            {/* Elegant Background Gradients */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none" style={{ zIndex: 0 }}>
                <div className="absolute w-96 h-96 bg-gradient-to-br from-purple-400/30 to-pink-400/30 dark:from-purple-600/20 dark:to-pink-600/20 rounded-full blur-3xl" style={{ top: '-5%', right: '10%' }} />
                <div className="absolute w-[500px] h-[500px] bg-gradient-to-tr from-blue-400/20 to-purple-400/20 dark:from-blue-600/15 dark:to-purple-600/15 rounded-full blur-3xl" style={{ bottom: '-10%', left: '-5%' }} />
                <div className="absolute w-80 h-80 bg-gradient-to-br from-pink-300/25 to-orange-300/25 dark:from-pink-500/15 dark:to-orange-500/15 rounded-full blur-3xl" style={{ top: '40%', left: '50%', transform: 'translateX(-50%)' }} />
            </div>

            <div className="relative">
                <DashboardHeader onToggleTheme={() => {
                    const isDark = document.documentElement.classList.contains('dark');
                    document.documentElement.classList.toggle('dark', !isDark);
                    localStorage.setItem('theme', !isDark ? 'dark' : 'light');
                }} />
            </div>

            {/* Navigation Tabs */}
            <div className="sticky top-[68px] z-20 flex justify-center py-3">
                <div className="inline-flex items-center gap-1.5 p-1.5 bg-white/70 dark:bg-brand-surface/70 backdrop-blur-xl rounded-full border border-zinc-200/50 dark:border-brand-border/30 shadow-lg shadow-zinc-900/5 dark:shadow-zinc-950/30">
                    {/* Chat Tab */}
                    <button
                        onClick={() => navigate('/dashboard')}
                        className="group relative flex items-center gap-2 px-4 py-2 rounded-full font-medium text-sm transition-all duration-200 bg-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                        </svg>
                        <span className="hidden sm:inline">Chat</span>
                        <span className="sm:hidden absolute -bottom-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-zinc-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                            Chat
                        </span>
                    </button>

                    {/* Transfer Tab */}
                    <button
                        onClick={() => navigate('/transfer')}
                        className="group relative flex items-center gap-2 px-4 py-2 rounded-full font-medium text-sm transition-all duration-200 bg-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="17 8 12 3 7 8" />
                            <line x1="12" y1="3" x2="12" y2="15" />
                        </svg>
                        <span className="hidden sm:inline">Transfer</span>
                        <span className="sm:hidden absolute -bottom-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-zinc-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                            Transfer
                        </span>
                    </button>

                    {/* Notes Tab */}
                    <button
                        className="group relative flex items-center gap-2 px-4 py-2 rounded-full font-medium text-sm transition-all duration-200 bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-md"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                            <polyline points="14 2 14 8 20 8"></polyline>
                            <line x1="16" y1="13" x2="8" y2="13"></line>
                            <line x1="16" y1="17" x2="8" y2="17"></line>
                            <polyline points="10 9 9 9 8 9"></polyline>
                        </svg>
                        <span className="hidden sm:inline">Notes</span>
                        <span className="sm:hidden absolute -bottom-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-zinc-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                            Notes
                        </span>
                    </button>
                </div>
            </div>

            <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 dark:from-purple-400 dark:to-pink-400 bg-clip-text text-transparent">My Notes</h1>
                        <p className="text-zinc-600 dark:text-brand-text-secondary mt-1">
                            Create and manage your collaborative notes
                        </p>
                    </div>
                    <Link
                        to="/dashboard/notes/new"
                        className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium hover:shadow-lg hover:scale-105 transition-all duration-200"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="12" y1="5" x2="12" y2="19"></line>
                            <line x1="5" y1="12" x2="19" y2="12"></line>
                        </svg>
                        <span className="hidden sm:inline">Create Note</span>
                    </Link>
                </div>

                {/* Search */}
                <div className="mb-6">
                    <div className="relative">
                        <svg className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="11" cy="11" r="8"></circle>
                            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                        </svg>
                        <input
                            type="text"
                            placeholder="Search notes by title or slug..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-12 pr-4 py-3.5 bg-white/70 dark:bg-brand-surface/70 backdrop-blur-xl border border-zinc-200/50 dark:border-brand-border/30 rounded-xl text-zinc-900 dark:text-brand-text-primary placeholder-zinc-500 dark:placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-purple-500 shadow-sm transition-all"
                        />
                    </div>
                </div>

                {/* Loading */}
                {loading && (
                    <div className="flex items-center justify-center py-12">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-accent-purple"></div>
                    </div>
                )}

                {/* Error */}
                {error && (
                    <div className="bg-red-50/80 dark:bg-red-900/20 backdrop-blur-sm border border-red-200 dark:border-red-800 rounded-xl p-4 text-red-600 dark:text-red-400">
                        {error}
                    </div>
                )}

                {/* Notes Grid */}
                {!loading && !error && (
                    <>
                        {filteredNotes.length === 0 ? (
                            <div className="text-center py-20 bg-white/40 dark:bg-brand-surface/40 backdrop-blur-xl rounded-2xl border border-zinc-200/50 dark:border-brand-border/30">
                                <div className="inline-flex p-6 bg-gradient-to-br from-purple-100 to-pink-100 dark:from-purple-900/30 dark:to-pink-900/30 rounded-full mb-6">
                                    <svg className="h-16 w-16 text-purple-600 dark:text-purple-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                </div>
                                <h3 className="text-2xl font-bold text-zinc-900 dark:text-brand-text-primary mb-2">
                                    {searchQuery ? 'No notes found' : 'No notes yet'}
                                </h3>
                                <p className="text-zinc-600 dark:text-brand-text-secondary mb-6 max-w-md mx-auto">
                                    {searchQuery ? 'Try a different search term or create a new note' : 'Start creating notes with rich text editing and custom URLs'}
                                </p>
                                {!searchQuery && (
                                    <Link
                                        to="/dashboard/notes/new"
                                        className="inline-flex items-center gap-2 px-8 py-3.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium hover:shadow-lg hover:scale-105 transition-all duration-200"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <line x1="12" y1="5" x2="12" y2="19"></line>
                                            <line x1="5" y1="12" x2="19" y2="12"></line>
                                        </svg>
                                        Create Your First Note
                                    </Link>
                                )}
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {filteredNotes.map((note) => (
                                    <div
                                        key={note._id}
                                        className="group relative bg-white/70 dark:bg-brand-surface/70 backdrop-blur-xl border border-zinc-200/50 dark:border-brand-border/30 rounded-2xl p-6 hover:shadow-xl hover:scale-[1.02] transition-all duration-200 cursor-pointer"
                                        onClick={() => navigate(`/dashboard/notes/${note.slug}/edit`)}
                                    >
                                        {/* Note Icon & Status */}
                                        <div className="flex items-start justify-between mb-4">
                                            <div className="flex items-center gap-2">
                                                <div className="p-2.5 bg-gradient-to-br from-purple-500/20 to-pink-500/20 dark:from-purple-500/30 dark:to-pink-500/30 rounded-xl">
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-purple-600 dark:text-purple-400">
                                                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                                        <polyline points="14 2 14 8 20 8"></polyline>
                                                        <line x1="16" y1="13" x2="8" y2="13"></line>
                                                        <line x1="16" y1="17" x2="8" y2="17"></line>
                                                    </svg>
                                                </div>
                                                {note.isPasswordProtected && (
                                                    <div className="p-1.5 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
                                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-orange-600 dark:text-orange-400">
                                                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                                                            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                                                        </svg>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Actions */}
                                            <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleDeleteNote(note._id, note.title);
                                                    }}
                                                    className="p-2 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                                                    title="Delete note"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-600 dark:text-red-400">
                                                        <polyline points="3 6 5 6 21 6"></polyline>
                                                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                                    </svg>
                                                </button>
                                            </div>
                                        </div>

                                        {/* Title */}
                                        <h3 className="font-semibold text-lg text-zinc-900 dark:text-brand-text-primary mb-2 truncate">
                                            {note.title}
                                        </h3>

                                        {/* Slug */}
                                        <div className="flex items-center gap-1.5 text-sm text-purple-600 dark:text-purple-400 mb-4 bg-purple-50/50 dark:bg-purple-900/20 px-3 py-1.5 rounded-lg">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                                                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                                            </svg>
                                            <span className="truncate font-medium">/notes/{note.slug}</span>
                                        </div>

                                        {/* Meta Info */}
                                        <div className="flex items-center justify-between text-xs">
                                            <span className={`px-3 py-1.5 rounded-lg font-medium ${note.isPublic ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300'}`}>
                                                {note.isPublic ? '🌐 Public' : '🔒 Private'}
                                            </span>
                                            <span className="text-zinc-500 dark:text-zinc-400">{formatDate(note.updatedAt)}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
