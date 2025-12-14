import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import Placeholder from '@tiptap/extension-placeholder';
import { common, createLowlight } from 'lowlight';
import { api } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import DashboardHeader from '../components/DashboardHeader';
import { io } from 'socket.io-client';

// Create lowlight instance with common languages
const lowlight = createLowlight(common);

export default function NoteEditorPage() {
    const { slug } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const { user, socket } = useAuth();

    const [note, setNote] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [title, setTitle] = useState('');
    const [noteSlug, setNoteSlug] = useState('');
    const [canEdit, setCanEdit] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [activeUsers, setActiveUsers] = useState([]);
    const [lastSaved, setLastSaved] = useState(null);
    const [copied, setCopied] = useState(false);
    const [metrics, setMetrics] = useState({ lines: 0, words: 0, selLines: 0 });

    const saveTimeoutRef = useRef(null);
    const broadcastTimeoutRef = useRef(null);
    const incomingUpdateRef = useRef(false);
    const isPublicView = location.pathname.startsWith('/notes/');

    // Initialize editor
    const editor = useEditor({
        extensions: [
            StarterKit,
            CodeBlockLowlight.configure({
                lowlight,
                defaultLanguage: 'plaintext',
            }),
            Placeholder.configure({
                placeholder: 'Start writing your note...',
            }),
        ],
        content: '',
        editable: true, // Always editable for collaborative editing
        editorProps: {
            attributes: {
                class: 'prose prose-sm sm:prose lg:prose-lg xl:prose-xl dark:prose-invert max-w-none focus:outline-none px-4 py-3',
            },
        },
        onUpdate: ({ editor }) => {
            // Ignore updates we applied from a remote change
            if (incomingUpdateRef.current) {
                incomingUpdateRef.current = false;
                return;
            }
            // Anyone can edit - always save and broadcast
            const json = editor.getJSON();
            debounceSave(json);
            debounceBroadcast(json);
        },
    });

    // Compute word/char counts and selection counts
    useEffect(() => {
        if (!editor) return;

        const compute = () => {
            try {
                const text = editor.getText() || '';
                const words = text.trim() ? text.trim().split(/\s+/).length : 0;

                // Count logical lines (paragraphs + hard breaks, code lines)
                let lines = 0;
                editor.state.doc.descendants((node) => {
                    const name = node.type?.name || '';
                    if (name === 'paragraph' || name.startsWith('heading')) {
                        // Count hard breaks inside this block
                        let hardBreaks = 0;
                        node.descendants((child) => {
                            const cn = child.type?.name || '';
                            if (cn === 'hardBreak' || cn === 'hard_break') hardBreaks++;
                        });
                        lines += 1 + hardBreaks;
                    } else if (name === 'codeBlock' || name === 'code_block' || name === 'codeBlockLowlight') {
                        const t = node.textContent || '';
                        const n = t.split('\n').length;
                        lines += Math.max(1, n);
                    }
                });

                const { from, to } = editor.state.selection;
                let selLines = 0;
                if (from !== to) {
                    editor.state.doc.nodesBetween(from, to, (node) => {
                        const name = node.type?.name || '';
                        if (name === 'paragraph' || name.startsWith('heading')) {
                            selLines += 1;
                        } else if (name === 'codeBlock' || name === 'code_block' || name === 'codeBlockLowlight') {
                            const t = node.textContent || '';
                            const n = t.split('\n').length;
                            selLines += Math.max(1, n);
                        } else if (name === 'hardBreak' || name === 'hard_break') {
                            selLines += 1;
                        }
                    });
                }

                setMetrics({ lines, words, selLines });
            } catch (e) {
                // noop
            }
        };

        compute();
        editor.on('update', compute);
        editor.on('selectionUpdate', compute);

        return () => {
            editor.off('update', compute);
            editor.off('selectionUpdate', compute);
        };
    }, [editor]);

    const handleCopyAll = async () => {
        try {
            if (!editor) return;
            const html = editor.getHTML();
            const text = editor.getText();

            // Best: write both HTML and plain text so paste keeps formatting where supported.
            if (navigator.clipboard && 'ClipboardItem' in window && window.isSecureContext) {
                const item = new ClipboardItem({
                    'text/html': new Blob([html || ''], { type: 'text/html' }),
                    'text/plain': new Blob([text || ''], { type: 'text/plain' })
                });
                await navigator.clipboard.write([item]);
            } else if (navigator.clipboard && navigator.clipboard.writeText) {
                // Fallback: copy plain text
                await navigator.clipboard.writeText(text || '');
            } else {
                // Legacy fallback: inject hidden editable node with HTML and execCommand('copy')
                const container = document.createElement('div');
                container.innerHTML = html || '';
                container.setAttribute('contenteditable', 'true');
                container.style.position = 'fixed';
                container.style.top = '-10000px';
                container.style.left = '-10000px';
                container.style.whiteSpace = 'pre-wrap'; // preserve spaces and newlines
                document.body.appendChild(container);
                const range = document.createRange();
                range.selectNodeContents(container);
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(range);
                document.execCommand('copy');
                sel.removeAllRanges();
                document.body.removeChild(container);
            }

            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch (e) {
            console.error('Failed to copy editor content:', e);
        }
    };

    // Real-time collaboration via Socket.IO
    useEffect(() => {
        if (!socket || !slug) {
            console.log('Socket or slug missing:', { socket: !!socket, slug });
            return;
        }

        console.log('Setting up real-time collaboration for:', slug);

        try {
            socket.emit('note:join', { noteSlug: slug, userId: user?.id, username: user?.username || user?.name || 'Anonymous' });
            console.log('Emitted note:join for:', slug);
        } catch (e) {
            console.error('Failed to join note:', e);
        }

        const handleRemoteContent = ({ content, socketId }) => {
            console.log('📥 Received content update from:', socketId);
            if (!editor) {
                console.log('❌ Editor not ready');
                return;
            }
            if (socket && socket.id && socketId === socket.id) {
                console.log('⏭️ Ignoring own update');
                return; // ignore own echoes
            }
            try {
                console.log('✅ Applying remote content update');
                incomingUpdateRef.current = true;
                editor.commands.setContent(content, false);
            } catch (e) {
                console.error('Failed to apply content:', e);
            }
        };

        const handleUserJoined = (payload) => {
            console.log('👋 User joined:', payload);
            setActiveUsers(prev => {
                if (prev.some(u => u.socketId === payload.socketId)) return prev;
                return [...prev, payload];
            });
        };

        const handleUserLeft = ({ socketId }) => {
            console.log('👋 User left:', socketId);
            setActiveUsers(prev => prev.filter(u => u.socketId !== socketId));
        };

        socket.on('note:content-changed', handleRemoteContent);
        socket.on('note:user-joined', handleUserJoined);
        socket.on('note:user-left', handleUserLeft);

        console.log('✅ Socket listeners registered');

        return () => {
            console.log('🧹 Cleaning up socket listeners for:', slug);
            try {
                socket.emit('note:leave', { noteSlug: slug, userId: user?.id });
            } catch (e) {
                console.error('Failed to leave note:', e);
            }
            socket.off('note:content-changed', handleRemoteContent);
            socket.off('note:user-joined', handleUserJoined);
            socket.off('note:user-left', handleUserLeft);
        };
    }, [socket, slug, editor, user]);

    useEffect(() => {
        if (slug) {
            loadNote();
        } else {
            // New note
            setLoading(false);
            setCanEdit(true);
            setTitle('Untitled Note');
            setNoteSlug('');
        }

        return () => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }
            if (broadcastTimeoutRef.current) {
                clearTimeout(broadcastTimeoutRef.current);
            }
        };
    }, [slug]);

    const loadNote = async () => {
        try {
            setLoading(true);
            const data = await api.getNoteBySlug(slug);

            if (data.requiresPassword) {
                setShowPasswordPrompt(true);
                setNote(data.note);
                setTitle(data.note.title);
                setNoteSlug(data.note.slug);
                setLoading(false);
                return;
            }

            setNote(data.note);
            setTitle(data.note.title);
            setNoteSlug(data.note.slug);
            setCanEdit(true); // Always allow editing for real-time collaboration

            // Debug logging
            console.log('Note loaded:', data.note);
            console.log('Note owner:', data.note.owner);
            console.log('Current user:', user);
            console.log('User _id:', user?._id);
            console.log('Owner comparison:', data.note.owner === user?._id, data.note.owner?._id === user?._id);

            if (editor && data.note.content) {
                editor.commands.setContent(data.note.content);
            }

            setLoading(false);
        } catch (err) {
            setError(err.message || 'Failed to load note');
            setLoading(false);
        }
    };

    const handleVerifyPassword = async (e) => {
        e.preventDefault();
        try {
            await api.verifyNotePassword(slug, password);
            setShowPasswordPrompt(false);
            setPassword('');
            loadNote();
        } catch (err) {
            alert(err.message || 'Incorrect password');
        }
    };

    const debounceSave = (content) => {
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }

        saveTimeoutRef.current = setTimeout(() => {
            handleSave(content);
        }, 2000); // Auto-save after 2 seconds of no typing
    };

    const debounceBroadcast = (content) => {
        if (!socket) {
            console.log('❌ No socket available for broadcast');
            return;
        }
        if (broadcastTimeoutRef.current) {
            clearTimeout(broadcastTimeoutRef.current);
        }
        broadcastTimeoutRef.current = setTimeout(() => {
            try {
                console.log('📤 Broadcasting content update to:', slug);
                socket.emit('note:content-update', { noteSlug: slug, content, userId: user?.id });
            } catch (e) {
                console.error('Failed to broadcast:', e);
            }
        }, 300); // broadcast quickly, but not every keystroke
    };

    const handleSave = async (content) => {
        // Allow anyone to save for real-time collaboration
        try {
            setSaving(true);

            if (note) {
                // Update existing note using slug for collaboration
                await api.updateNoteBySlug(note.slug, {
                    title,
                    content: content || editor.getJSON(),
                });
            } else {
                // Create new note
                if (!noteSlug) {
                    setError('Please set a URL slug for your note');
                    setSaving(false);
                    return;
                }

                const newNote = await api.createNote({
                    slug: noteSlug,
                    title: title || 'Untitled Note',
                    content: content || editor.getJSON(),
                    isPublic: true, // Default to public
                });

                setNote(newNote.note);
                navigate(`/dashboard/notes/${noteSlug}/edit`, { replace: true });
            }

            setLastSaved(new Date());
            setSaving(false);
        } catch (err) {
            setError(err.message || 'Failed to save note');
            setSaving(false);
        }
    };

    const handleManualSave = () => {
        if (editor) {
            handleSave(editor.getJSON());
        }
    };

    const formatLastSaved = () => {
        if (!lastSaved) return '';
        const now = new Date();
        const diffSeconds = Math.floor((now - lastSaved) / 1000);
        if (diffSeconds < 10) return 'Just now';
        if (diffSeconds < 60) return `${diffSeconds}s ago`;
        return lastSaved.toLocaleTimeString();
    };

    if (showPasswordPrompt) {
        return (
            <div className="min-h-screen bg-white dark:bg-brand-bg text-zinc-900 dark:text-brand-text-primary font-sans antialiased overflow-hidden relative flex items-center justify-center px-4">
                {/* Background shapes - matching website theme */}
                <div className="fixed inset-0 z-0 pointer-events-none">
                    <div className="absolute rounded-full blur-[120px] bg-brand-accent-blue/80 opacity-80 dark:bg-brand-accent-blue/25 dark:opacity-25" style={{ width: 420, height: 420, top: '8%', left: '12%' }} />
                    <div className="absolute rounded-full blur-[100px] bg-brand-accent-pink/70 opacity-70 dark:bg-brand-accent-pink/22 dark:opacity-22" style={{ width: 360, height: 360, top: '48%', left: '58%' }} />
                    <div className="absolute rounded-full blur-[110px] bg-brand-accent-purple/65 opacity-65 dark:bg-brand-accent-purple/30 dark:opacity-30" style={{ width: 500, height: 500, top: '28%', left: '72%' }} />
                </div>

                {/* Theme toggle for public/password prompt view */}
                <div className="absolute top-4 right-4 z-20">
                    <button
                        onClick={() => {
                            const isDark = document.documentElement.classList.contains('dark');
                            document.documentElement.classList.toggle('dark', !isDark);
                            localStorage.setItem('theme', !isDark ? 'dark' : 'light');
                        }}
                        className="p-2.5 bg-white/70 dark:bg-zinc-800/70 backdrop-blur border border-zinc-200/60 dark:border-zinc-700/60 rounded-xl text-zinc-700 dark:text-zinc-200 hover:shadow-sm"
                        title="Toggle theme"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
                        </svg>
                    </button>
                </div>

                <div className="relative z-10 max-w-md w-full glass-effect p-10 md:p-12 rounded-3xl bg-white/95 dark:bg-brand-surface border border-zinc-200 dark:border-brand-border shadow-2xl">
                    <div className="text-center mb-6">
                        <div className="mx-auto w-20 h-20 bg-gradient-to-br from-brand-accent-purple/20 to-brand-accent-pink/20 dark:from-brand-accent-purple/30 dark:to-brand-accent-pink/30 rounded-full flex items-center justify-center mb-4">
                            <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-brand-accent-purple dark:text-brand-accent-purple">
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                            </svg>
                        </div>
                        <h2 className="text-3xl font-bold bg-gradient-to-r from-brand-accent-purple to-brand-accent-pink bg-clip-text text-transparent mb-2">
                            Password Protected
                        </h2>
                        <p className="text-zinc-600 dark:text-brand-text-secondary">
                            This note requires a password to view
                        </p>
                    </div>

                    {error && (
                        <div className="mb-4 p-3 bg-red-50/80 dark:bg-red-900/20 backdrop-blur-sm border border-red-200 dark:border-red-800 rounded-xl text-red-600 dark:text-red-400 text-sm">
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleVerifyPassword} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                                Password
                            </label>
                            <div className="relative">
                                <input
                                    type={showPassword ? "text" : "password"}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full px-4 py-3 pr-12 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-brand-accent-purple"
                                    placeholder="Enter password"
                                    required
                                    autoFocus
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
                            className="w-full py-3.5 bg-brand-accent-purple text-white rounded-xl font-semibold hover:bg-brand-accent-purple/90 hover:shadow-lg hover:scale-[1.02] transition-all duration-200"
                        >
                            Unlock Note
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-white dark:bg-brand-bg flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-accent-purple"></div>
            </div>
        );
    }

    if (error && !note) {
        return (
            <div className="min-h-screen bg-white dark:bg-brand-bg flex items-center justify-center px-4">
                <div className="text-center">
                    <h2 className="text-2xl font-bold text-zinc-900 dark:text-brand-text-primary mb-2">
                        Error Loading Note
                    </h2>
                    <p className="text-zinc-600 dark:text-brand-text-secondary mb-4">{error}</p>
                    <button
                        onClick={() => navigate('/dashboard/notes')}
                        className="px-6 py-2 bg-brand-accent-purple text-white rounded-lg font-medium hover:bg-brand-accent-purple/90 transition-colors"
                    >
                        Back to Notes
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-zinc-50 via-zinc-100 to-zinc-200 dark:from-zinc-900 dark:via-brand-bg dark:to-zinc-950 text-zinc-900 dark:text-brand-text-primary font-sans antialiased transition-colors duration-300 relative">
            {/* Elegant Background Gradients */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none" style={{ zIndex: 0 }}>
                <div className="absolute w-96 h-96 bg-gradient-to-br from-purple-400/30 to-pink-400/30 dark:from-purple-600/20 dark:to-pink-600/20 rounded-full blur-3xl" style={{ top: '-5%', right: '10%' }} />
                <div className="absolute w-[500px] h-[500px] bg-gradient-to-tr from-blue-400/20 to-purple-400/20 dark:from-blue-600/15 dark:to-purple-600/15 rounded-full blur-3xl" style={{ bottom: '-10%', left: '-5%' }} />
                <div className="absolute w-80 h-80 bg-gradient-to-br from-pink-300/25 to-orange-300/25 dark:from-pink-500/15 dark:to-orange-500/15 rounded-full blur-3xl" style={{ top: '40%', left: '50%', transform: 'translateX(-50%)' }} />
            </div>

            {/* Header area */}
            {isPublicView ? (
                <div className="relative w-full flex items-center justify-end px-4 py-3">
                    <button
                        onClick={() => {
                            const isDark = document.documentElement.classList.contains('dark');
                            document.documentElement.classList.toggle('dark', !isDark);
                            localStorage.setItem('theme', !isDark ? 'dark' : 'light');
                        }}
                        className="p-2.5 bg-white/70 dark:bg-zinc-800/70 backdrop-blur border border-zinc-200/60 dark:border-zinc-700/60 rounded-xl text-zinc-700 dark:text-zinc-200 hover:shadow-sm"
                        title="Toggle theme"
                    >
                        {/* Sun/Moon icon */}
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
                        </svg>
                    </button>
                </div>
            ) : (
                <div className="relative">
                    <DashboardHeader onToggleTheme={() => {
                        const isDark = document.documentElement.classList.contains('dark');
                        document.documentElement.classList.toggle('dark', !isDark);
                        localStorage.setItem('theme', !isDark ? 'dark' : 'light');
                    }} />
                </div>
            )}

            <div className="relative z-10 max-w-5xl mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-8">
                {/* Header */}
                <div className="mb-4 sm:mb-6 bg-white/70 dark:bg-brand-surface/70 backdrop-blur-xl border border-zinc-200/50 dark:border-brand-border/30 rounded-2xl p-4 sm:p-6 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <button
                            onClick={() => navigate('/dashboard/notes')}
                            className="flex items-center gap-2 px-3 py-2 sm:px-4 text-zinc-600 dark:text-brand-text-secondary hover:text-zinc-900 dark:hover:text-brand-text-primary bg-zinc-100/50 dark:bg-zinc-800/50 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-all"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="19" y1="12" x2="5" y2="12"></line>
                                <polyline points="12 19 5 12 12 5"></polyline>
                            </svg>
                            <span className="font-medium hidden sm:inline">Back</span>
                        </button>

                        <div className="flex items-center gap-2 sm:gap-3">
                            {/* Word/Char/Selection count */}
                            <span className="hidden md:inline-flex text-xs text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-3 py-1.5 rounded-lg whitespace-nowrap">
                                {new Intl.NumberFormat().format(metrics.lines)} lines • {new Intl.NumberFormat().format(metrics.words)} words
                                {metrics.selLines > 0 && (
                                    <>
                                        {' '}• {new Intl.NumberFormat().format(metrics.selLines)} selected lines
                                    </>
                                )}
                            </span>
                            {/* Active Users */}
                            {activeUsers.length > 0 && (
                                <div className="hidden md:flex items-center gap-2 text-sm bg-blue-50 dark:bg-blue-900/20 px-3 py-1.5 rounded-lg">
                                    <span className="text-blue-700 dark:text-blue-300 font-medium">Editing:</span>
                                    <div className="flex items-center gap-1.5">
                                        {activeUsers.map((user, i) => (
                                            <span key={i} className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded-full text-xs font-medium">
                                                {user.username}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {saving && (
                                <span className="text-sm text-zinc-600 dark:text-zinc-400 flex items-center gap-2 bg-purple-50 dark:bg-purple-900/20 px-3 py-1.5 rounded-lg">
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-600"></div>
                                    Saving...
                                </span>
                            )}
                            {!saving && lastSaved && (
                                <span className="text-sm text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="20 6 9 17 4 12"></polyline>
                                    </svg>
                                    Saved {formatLastSaved()}
                                </span>
                            )}

                            <button
                                onClick={handleManualSave}
                                className="px-3 py-2 sm:px-5 sm:py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium hover:shadow-lg hover:scale-105 transition-all duration-200"
                            >
                                Save
                            </button>

                            {/* Show settings if user is logged in */}
                            {user && (
                                <button
                                    onClick={() => setShowSettings(true)}
                                    className="p-2.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors"
                                    title="Settings"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-600 dark:text-brand-text-secondary">
                                        <circle cx="12" cy="12" r="3"></circle>
                                        <path d="M12 1v6m0 6v6"></path>
                                    </svg>
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Title Input */}
                    <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Note title..."
                        className="w-full text-2xl sm:text-3xl md:text-4xl font-bold bg-transparent border-none focus:outline-none text-zinc-900 dark:text-brand-text-primary placeholder-zinc-400 dark:placeholder-zinc-500 mb-2"
                    />

                    {/* Slug Input (for new notes) */}
                    {!note && (
                        <div className="flex items-center gap-2 text-sm bg-purple-50/50 dark:bg-purple-900/20 px-4 py-3 rounded-xl border border-purple-200/50 dark:border-purple-800/30">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-purple-600 dark:text-purple-400">
                                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                            </svg>
                            <span className="text-zinc-600 dark:text-zinc-400 font-medium">URL:</span>
                            <span className="text-zinc-700 dark:text-zinc-300">/notes/</span>
                            <input
                                type="text"
                                value={noteSlug}
                                onChange={(e) => setNoteSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                                placeholder="my-note"
                                className="flex-1 bg-white dark:bg-brand-surface border border-zinc-200 dark:border-brand-border rounded-lg px-3 py-1.5 text-zinc-900 dark:text-brand-text-primary focus:outline-none focus:ring-2 focus:ring-purple-500 font-medium"
                            />
                        </div>
                    )}

                    {note && (
                        <div className="flex items-center gap-2 text-sm text-purple-600 dark:text-purple-400 bg-purple-50/50 dark:bg-purple-900/20 px-4 py-2 rounded-lg w-fit">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                            </svg>
                            <span className="font-medium">/notes/{note.slug}</span>
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                            </svg>
                            <a href={`/notes/${note.slug}`} target="_blank" rel="noopener noreferrer" className="hover:underline">
                                {window.location.origin}/notes/{note.slug}
                            </a>
                        </div>
                    )}
                </div>

                {/* Editor Toolbar */}
                {editor && (
                    <div className="flex items-center gap-1 p-2 bg-white/70 dark:bg-brand-surface/70 backdrop-blur-xl border border-zinc-200/50 dark:border-brand-border/30 rounded-xl mb-4 overflow-x-auto shadow-sm sticky top-2 md:static z-10">
                        <button
                            onClick={() => editor.chain().focus().toggleBold().run()}
                            className={`p-2 rounded transition-colors ${editor.isActive('bold') ? 'bg-zinc-300 dark:bg-zinc-600' : 'hover:bg-zinc-200 dark:hover:bg-zinc-700'}`}
                            title="Bold"
                        >
                            <strong>B</strong>
                        </button>
                        <button
                            onClick={() => editor.chain().focus().toggleItalic().run()}
                            className={`p-2 rounded transition-colors ${editor.isActive('italic') ? 'bg-zinc-300 dark:bg-zinc-600' : 'hover:bg-zinc-200 dark:hover:bg-zinc-700'}`}
                            title="Italic"
                        >
                            <em>I</em>
                        </button>
                        <button
                            onClick={() => editor.chain().focus().toggleStrike().run()}
                            className={`p-2 rounded transition-colors ${editor.isActive('strike') ? 'bg-zinc-300 dark:bg-zinc-600' : 'hover:bg-zinc-200 dark:hover:bg-zinc-700'}`}
                            title="Strikethrough"
                        >
                            <s>S</s>
                        </button>

                        <div className="w-px h-6 bg-zinc-300 dark:bg-zinc-600 mx-1"></div>

                        <button
                            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                            className={`p-2 rounded transition-colors ${editor.isActive('heading', { level: 1 }) ? 'bg-zinc-300 dark:bg-zinc-600' : 'hover:bg-zinc-200 dark:hover:bg-zinc-700'}`}
                            title="Heading 1"
                        >
                            H1
                        </button>
                        <button
                            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                            className={`p-2 rounded transition-colors ${editor.isActive('heading', { level: 2 }) ? 'bg-zinc-300 dark:bg-zinc-600' : 'hover:bg-zinc-200 dark:hover:bg-zinc-700'}`}
                            title="Heading 2"
                        >
                            H2
                        </button>
                        <button
                            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
                            className={`p-2 rounded transition-colors ${editor.isActive('heading', { level: 3 }) ? 'bg-zinc-300 dark:bg-zinc-600' : 'hover:bg-zinc-200 dark:hover:bg-zinc-700'}`}
                            title="Heading 3"
                        >
                            H3
                        </button>

                        <div className="w-px h-6 bg-zinc-300 dark:bg-zinc-600 mx-1"></div>

                        <button
                            onClick={() => editor.chain().focus().toggleBulletList().run()}
                            className={`p-2 rounded transition-colors ${editor.isActive('bulletList') ? 'bg-zinc-300 dark:bg-zinc-600' : 'hover:bg-zinc-200 dark:hover:bg-zinc-700'}`}
                            title="Bullet List"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="8" y1="6" x2="21" y2="6"></line>
                                <line x1="8" y1="12" x2="21" y2="12"></line>
                                <line x1="8" y1="18" x2="21" y2="18"></line>
                                <line x1="3" y1="6" x2="3.01" y2="6"></line>
                                <line x1="3" y1="12" x2="3.01" y2="12"></line>
                                <line x1="3" y1="18" x2="3.01" y2="18"></line>
                            </svg>
                        </button>
                        <button
                            onClick={() => editor.chain().focus().toggleOrderedList().run()}
                            className={`p-2 rounded transition-colors ${editor.isActive('orderedList') ? 'bg-zinc-300 dark:bg-zinc-600' : 'hover:bg-zinc-200 dark:hover:bg-zinc-700'}`}
                            title="Numbered List"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="10" y1="6" x2="21" y2="6"></line>
                                <line x1="10" y1="12" x2="21" y2="12"></line>
                                <line x1="10" y1="18" x2="21" y2="18"></line>
                                <path d="M4 6h1v4"></path>
                                <path d="M4 10h2"></path>
                                <path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"></path>
                            </svg>
                        </button>

                        <div className="w-px h-6 bg-zinc-300 dark:bg-zinc-600 mx-1"></div>

                        <button
                            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
                            className={`p-2 rounded transition-colors ${editor.isActive('codeBlock') ? 'bg-zinc-300 dark:bg-zinc-600' : 'hover:bg-zinc-200 dark:hover:bg-zinc-700'}`}
                            title="Code Block"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="16 18 22 12 16 6"></polyline>
                                <polyline points="8 6 2 12 8 18"></polyline>
                            </svg>
                        </button>
                        <button
                            onClick={() => editor.chain().focus().toggleBlockquote().run()}
                            className={`p-2 rounded transition-colors ${editor.isActive('blockquote') ? 'bg-zinc-300 dark:bg-zinc-600' : 'hover:bg-zinc-200 dark:hover:bg-zinc-700'}`}
                            title="Quote"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"></path>
                                <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"></path>
                            </svg>
                        </button>
                        <button
                            onClick={() => editor.chain().focus().setHorizontalRule().run()}
                            className="p-2 rounded transition-colors hover:bg-zinc-200 dark:hover:bg-zinc-700"
                            title="Horizontal Rule"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="3" y1="12" x2="21" y2="12"></line>
                            </svg>
                        </button>
                    </div>
                )}

                {/* Editor Content - Fixed height with scroll */}
                <div className="relative">
                    {/* Copy all button (top-right, pinned) */}
                    <button
                        type="button"
                        onClick={handleCopyAll}
                        disabled={!editor}
                        title={copied ? 'Copied!' : 'Copy all text'}
                        aria-label="Copy all text"
                        className={`absolute top-2 right-2 z-10 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-500 ${copied
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                            : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700'
                            } disabled:opacity-50`}
                    >
                        {copied ? (
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
                        ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                            </svg>
                        )}
                        <span className="hidden sm:inline">{copied ? 'Copied' : 'Copy'}</span>
                    </button>

                    {/* Scrollable editor box */}
                    <div className="bg-white/70 dark:bg-brand-surface/70 backdrop-blur-xl border border-zinc-200/50 dark:border-brand-border/30 rounded-2xl shadow-sm overflow-hidden">
                        <div className="min-h-[50dvh] max-h-[calc(100dvh-260px)] md:max-h-[calc(100dvh-400px)] overflow-y-auto scrollbar-custom">
                            <EditorContent editor={editor} />
                        </div>
                    </div>
                </div>

                {/* Settings Modal */}
                {showSettings && note && (
                    <SettingsModal
                        note={note}
                        onClose={() => setShowSettings(false)}
                        onUpdate={(updatedNote) => {
                            setNote(updatedNote);
                            setShowSettings(false);
                        }}
                    />
                )}
            </div>
        </div>
    );
}

// Settings Modal Component
function SettingsModal({ note, onClose, onUpdate }) {
    const [isPublic, setIsPublic] = useState(note.isPublic);
    const [isPasswordProtected, setIsPasswordProtected] = useState(note.isPasswordProtected);
    const [newPassword, setNewPassword] = useState('');
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const handleSave = async () => {
        try {
            setSaving(true);
            setError('');

            const updates = {
                isPublic,
                isPasswordProtected,
            };

            if (isPasswordProtected && newPassword) {
                updates.password = newPassword;
            }

            const data = await api.updateNoteSettings(note._id, updates);
            onUpdate(data.note);
        } catch (err) {
            setError(err.message || 'Failed to update settings');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className="bg-white dark:bg-brand-surface border border-zinc-200 dark:border-brand-border rounded-2xl shadow-2xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-2xl font-bold text-zinc-900 dark:text-brand-text-primary">Note Settings</h3>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>

                {error && (
                    <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-sm">
                        {error}
                    </div>
                )}

                <div className="space-y-6">
                    {/* Public/Private Toggle */}
                    <div className="flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl">
                        <div>
                            <label className="font-medium text-zinc-900 dark:text-brand-text-primary flex items-center gap-2">
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={isPublic ? 'text-green-600' : 'text-zinc-400'}>
                                    <circle cx="12" cy="12" r="10"></circle>
                                    <line x1="2" y1="12" x2="22" y2="12"></line>
                                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
                                </svg>
                                Public Access
                            </label>
                            <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
                                {isPublic ? 'Anyone with the link can view' : 'Only you can access'}
                            </p>
                        </div>
                        <button
                            onClick={() => setIsPublic(!isPublic)}
                            className={`relative w-14 h-7 rounded-full transition-colors ${isPublic ? 'bg-green-500' : 'bg-zinc-300 dark:bg-zinc-600'}`}
                        >
                            <div className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full transition-transform ${isPublic ? 'translate-x-7' : ''}`}></div>
                        </button>
                    </div>

                    {/* Password Protection Toggle */}
                    <div className="flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl">
                        <div>
                            <label className="font-medium text-zinc-900 dark:text-brand-text-primary flex items-center gap-2">
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={isPasswordProtected ? 'text-orange-600' : 'text-zinc-400'}>
                                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                                </svg>
                                Password Protection
                            </label>
                            <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
                                {isPasswordProtected ? 'Requires password to view' : 'No password required'}
                            </p>
                        </div>
                        <button
                            onClick={() => setIsPasswordProtected(!isPasswordProtected)}
                            className={`relative w-14 h-7 rounded-full transition-colors ${isPasswordProtected ? 'bg-orange-500' : 'bg-zinc-300 dark:bg-zinc-600'}`}
                        >
                            <div className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full transition-transform ${isPasswordProtected ? 'translate-x-7' : ''}`}></div>
                        </button>
                    </div>

                    {/* Password Input (if enabled) */}
                    {isPasswordProtected && (
                        <div className="p-4 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800/30 rounded-xl">
                            <label className="block text-sm font-medium text-zinc-900 dark:text-brand-text-primary mb-2">
                                {note.isPasswordProtected ? 'Change Password' : 'Set Password'}
                            </label>
                            <div className="relative">
                                <input
                                    type={showNewPassword ? "text" : "password"}
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    placeholder={note.isPasswordProtected ? 'Leave empty to keep current password' : 'Enter a password'}
                                    className="w-full px-4 py-2.5 pr-12 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-orange-500"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowNewPassword(!showNewPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors"
                                    aria-label={showNewPassword ? "Hide password" : "Show password"}
                                >
                                    {showNewPassword ? (
                                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                                            <line x1="1" y1="1" x2="23" y2="23"></line>
                                        </svg>
                                    ) : (
                                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                            <circle cx="12" cy="12" r="3"></circle>
                                        </svg>
                                    )}
                                </button>
                            </div>
                            {note.isPasswordProtected && !newPassword && (
                                <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-2">
                                    Current password will be kept if you don't enter a new one
                                </p>
                            )}
                        </div>
                    )}
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3 mt-6">
                    <button
                        onClick={onClose}
                        className="flex-1 px-4 py-2.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-xl font-medium hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving || (isPasswordProtected && !note.isPasswordProtected && !newPassword)}
                        className="flex-1 px-4 py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium hover:shadow-lg hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 transition-all duration-200"
                    >
                        {saving ? 'Saving...' : 'Save Settings'}
                    </button>
                </div>
            </div>
        </div>
    );
}
