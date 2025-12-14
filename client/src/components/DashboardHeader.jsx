import React from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { api } from '../utils/api'
import { io } from 'socket.io-client'

export default function DashboardHeader({ onToggleTheme }) {
    const { user, logout, updateProfile, isSocketConnected, loading: authLoading } = useAuth()
    const navigate = useNavigate()

    // Safety check: if auth check completed and there is still no user, redirect to login
    React.useEffect(() => {
        if (!authLoading && !user) {
            console.warn('No user found in DashboardHeader after auth check, redirecting to login')
            navigate('/login', { replace: true })
        }
    }, [user, authLoading, navigate])

    const [showDropdown, setShowDropdown] = React.useState(false)
    const [showEdit, setShowEdit] = React.useState(false)
    const [saving, setSaving] = React.useState(false)
    const [message, setMessage] = React.useState('')
    const [error, setError] = React.useState('')
    const [fields, setFields] = React.useState({
        name: user?.name || '',
        username: user?.username || '',
        email: user?.email || '',
        password: '', // current password
        newPassword: '',
    })
    const [checkingUsername, setCheckingUsername] = React.useState(false)
    const [usernameAvailable, setUsernameAvailable] = React.useState(null) // null | true | false
    const [showCurrentPassword, setShowCurrentPassword] = React.useState(false)
    const [showNewPassword, setShowNewPassword] = React.useState(false)
    const [searchQuery, setSearchQuery] = React.useState('')
    const [searchResults, setSearchResults] = React.useState([])
    const [searching, setSearching] = React.useState(false)
    const [showSearchResults, setShowSearchResults] = React.useState(false)
    const [pendingRequests, setPendingRequests] = React.useState([])
    const [sentRequests, setSentRequests] = React.useState([])
    const [showFriendRequests, setShowFriendRequests] = React.useState(false)
    const [requestsTab, setRequestsTab] = React.useState('received') // 'received' or 'sent'
    const [sendingRequest, setSendingRequest] = React.useState(null)
    const [friendError, setFriendError] = React.useState('')
    const [showDeleteAccount, setShowDeleteAccount] = React.useState(false)
    const [deletionStep, setDeletionStep] = React.useState(1) // 1: request code, 2: enter code
    const [deletionCode, setDeletionCode] = React.useState('')
    const [deletionLoading, setDeletionLoading] = React.useState(false)
    const [deletionError, setDeletionError] = React.useState('')
    const [deletionMessage, setDeletionMessage] = React.useState('')
    const [emailChangeStep, setEmailChangeStep] = React.useState(0) // 0: normal, 1: verify OTP
    const [emailChangeCode, setEmailChangeCode] = React.useState('')
    const [emailChangeLoading, setEmailChangeLoading] = React.useState(false)
    const [emailChangeError, setEmailChangeError] = React.useState('')
    const [emailChangeMessage, setEmailChangeMessage] = React.useState('')
    const [pendingNewEmail, setPendingNewEmail] = React.useState('')

    const handleLogout = async () => {
        await logout()
        localStorage.setItem('isLoggedIn', 'false')
        navigate('/login')
    }

    const handleDeleteAccountOpen = () => {
        setShowDeleteAccount(true)
        setDeletionStep(1)
        setDeletionCode('')
        setDeletionError('')
        setDeletionMessage('')
        setShowDropdown(false)
    }

    const handleDeleteAccountClose = () => {
        if (deletionLoading) return
        setShowDeleteAccount(false)
        setDeletionStep(1)
        setDeletionCode('')
        setDeletionError('')
        setDeletionMessage('')
    }

    const handleRequestDeletionCode = async () => {
        setDeletionError('')
        setDeletionMessage('')
        setDeletionLoading(true)

        try {
            await api.requestAccountDeletion(user.email)
            setDeletionMessage('A 6-digit verification code has been sent to your email.')
            setDeletionStep(2)
        } catch (err) {
            setDeletionError(err.message || 'Failed to send verification code.')
        } finally {
            setDeletionLoading(false)
        }
    }

    const handleDeleteAccountSubmit = async (e) => {
        e.preventDefault()
        setDeletionError('')
        setDeletionMessage('')

        if (!deletionCode.trim() || deletionCode.trim().length !== 6) {
            return setDeletionError('Please enter the 6-digit code.')
        }

        setDeletionLoading(true)

        try {
            await api.deleteAccount(user.email, deletionCode.trim())
            setDeletionMessage('Account successfully deleted. Logging out...')

            // Logout and redirect after short delay
            setTimeout(async () => {
                await logout()
                localStorage.setItem('isLoggedIn', 'false')
                navigate('/login')
            }, 2000)
        } catch (err) {
            setDeletionError(err.message || 'Failed to delete account.')
            setDeletionLoading(false)
        }
    }

    const handleEditOpen = () => {
        setFields({
            name: user?.name || '',
            username: user?.username || '',
            email: user?.email || '',
            password: '',
            newPassword: '',
        })
        setError('')
        setMessage('')
        setEmailChangeStep(0)
        setEmailChangeCode('')
        setEmailChangeError('')
        setEmailChangeMessage('')
        setPendingNewEmail('')
        setShowDropdown(false)
        setShowEdit(true)
    }

    const handleEditClose = () => {
        if (saving) return
        setShowEdit(false)
    }

    const onChange = (e) => {
        const { name, value } = e.target
        setFields((prev) => ({ ...prev, [name]: value }))
    }

    // Debounced username availability check
    React.useEffect(() => {
        if (!showEdit) return
        const uname = fields.username.trim().toLowerCase()
        if (!uname || uname === (user?.username || '')) {
            setUsernameAvailable(true)
            setCheckingUsername(false)
            return
        }
        if (uname.length < 3 || uname.length > 20 || !/^[a-z0-9_.-]+$/.test(uname)) {
            setUsernameAvailable(false)
            setCheckingUsername(false)
            return
        }
        setCheckingUsername(true)
        const t = setTimeout(async () => {
            try {
                const res = await import('../utils/api').then(m => m.api.checkUsername(uname))
                setUsernameAvailable(res.available)
            } catch (e) {
                setUsernameAvailable(null)
            } finally {
                setCheckingUsername(false)
            }
        }, 400)
        return () => clearTimeout(t)
    }, [fields.username, showEdit])

    const onSubmit = async (e) => {
        e.preventDefault()
        setError('')
        setMessage('')

        // Check if email is being changed
        const emailChanged = fields.email.trim().toLowerCase() !== (user?.email || '').toLowerCase()

        if (emailChanged) {
            // Email change requires verification
            setEmailChangeError('')
            setEmailChangeMessage('')

            if (!/.+@.+\..+/.test(fields.email.trim())) {
                return setEmailChangeError('Enter a valid email')
            }

            setEmailChangeLoading(true)
            try {
                await api.requestEmailChange(fields.email.trim())
                setPendingNewEmail(fields.email.trim())
                setEmailChangeMessage('A 6-digit verification code has been sent to your new email.')
                setEmailChangeStep(1)
            } catch (err) {
                setEmailChangeError(err.message || 'Failed to send verification code.')
            } finally {
                setEmailChangeLoading(false)
            }
            return
        }

        // Basic validation for other fields
        if (!fields.name.trim()) return setError('Name is required')
        if (!fields.username.trim()) return setError('Username is required')
        if (fields.newPassword && fields.newPassword.length < 8) return setError('New password must be at least 8 characters')
        if (fields.newPassword && !fields.password) return setError('Please enter your current password to change it')

        setSaving(true)
        try {
            const payload = {
                name: fields.name.trim(),
                username: fields.username.trim(),
                password: fields.password || undefined,
                newPassword: fields.newPassword || undefined,
            }
            const res = await updateProfile(payload)
            if (!res.success) throw new Error(res.error || 'Update failed')
            setMessage('Profile updated')
            // Close after a short delay
            setTimeout(() => setShowEdit(false), 600)
        } catch (err) {
            setError(err.message || 'Failed to update profile')
        } finally {
            setSaving(false)
        }
    }

    const handleVerifyEmailChange = async (e) => {
        e.preventDefault()
        setEmailChangeError('')
        setEmailChangeMessage('')

        if (!emailChangeCode.trim() || emailChangeCode.trim().length !== 6) {
            return setEmailChangeError('Please enter the 6-digit code.')
        }

        setEmailChangeLoading(true)
        try {
            await api.verifyEmailChange(emailChangeCode.trim())
            setEmailChangeMessage('Email successfully updated!')

            // Update local fields to reflect the change
            setFields(prev => ({ ...prev, email: pendingNewEmail }))

            // Reset email change state and close after short delay
            setTimeout(() => {
                setEmailChangeStep(0)
                setEmailChangeCode('')
                setPendingNewEmail('')
                setShowEdit(false)
                // Refresh user data
                window.location.reload()
            }, 1500)
        } catch (err) {
            setEmailChangeError(err.message || 'Failed to verify email change.')
        } finally {
            setEmailChangeLoading(false)
        }
    }

    // Get user initials for avatar
    const getUserInitials = (name) => {
        if (!name) return 'U'
        return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    }

    // Load pending friend requests
    const loadPendingRequests = async () => {
        try {
            const res = await api.getPendingRequests()
            setPendingRequests(res.requests || [])
        } catch (e) {
            console.error('Failed to load pending requests:', e)
        }
    }

    // Load sent friend requests
    const loadSentRequests = async () => {
        console.log('🔄 Loading sent requests from backend...')
        try {
            const res = await api.getSentRequests()
            console.log('📥 Received sent requests:', res.requests?.map(r => ({ id: r.id, receiver: r.receiver.name })))
            setSentRequests(res.requests || [])
        } catch (e) {
            console.error('Failed to load sent requests:', e)
        }
    }

    // Top-level search results refresh function
    const refreshSearchResults = React.useCallback(() => {
        if (searchQuery.trim().length >= 2) {
            api.searchUsers(searchQuery).then(res => {
                setSearchResults(res.users || [])
            })
        }
    }, [searchQuery])

    // Send friend request
    const handleSendFriendRequest = async (userId) => {
        setSendingRequest(userId)
        setFriendError('')
        try {
            await api.sendFriendRequest(userId)
            loadSentRequests()
            refreshSearchResults()
        } catch (e) {
            console.error('Failed to send friend request:', e)
            setFriendError(e?.message || 'Failed to send request')
        } finally {
            setSendingRequest(null)
        }
    }

    // Accept friend request
    const handleAcceptRequest = async (requestId) => {
        try {
            await api.acceptFriendRequest(requestId)
            await loadPendingRequests()
            refreshSearchResults()
        } catch (e) {
            console.error('Failed to accept request:', e)
        }
    }

    // Reject friend request
    const handleRejectRequest = async (requestId) => {
        try {
            await api.rejectFriendRequest(requestId)
            await loadPendingRequests()
            setTimeout(loadSentRequests, 500)
            refreshSearchResults()
        } catch (e) {
            console.error('Failed to reject request:', e)
        }
    }

    // Cancel sent friend request
    const handleCancelRequest = async (requestId) => {
        console.log('🗑️ Cancelling request:', requestId)
        try {
            // First call backend to delete
            const response = await api.cancelFriendRequest(requestId)
            console.log('✅ Backend deleted:', response)
            // Then update UI immediately after successful deletion
            setSentRequests(prev => {
                console.log('📋 Current sent requests before filter:', prev.map(r => r.id))
                const filtered = prev.filter(r => r.id !== requestId)
                console.log('📋 After filter:', filtered.map(r => r.id))
                return filtered
            })
            refreshSearchResults()
        } catch (e) {
            console.error('❌ Failed to cancel request:', e)
            // Reload on error to ensure UI is in sync
            loadSentRequests()
        }
    }

    // Load pending requests on mount
    React.useEffect(() => {
        if (user) {
            loadPendingRequests()
            loadSentRequests()

            // Listen for real-time friend requests via Socket.IO
            console.log('🔌 Creating new socket connection...')
            const socket = io(import.meta.env.DEV ? undefined : (import.meta.env.VITE_API_URL || undefined), {
                withCredentials: true
            })

            socket.on('connect', () => {
                console.log('✅ Socket connected:', socket.id)
            })

            socket.on('friend-request-received', (data) => {
                if (data.userId === user.id) {
                    setPendingRequests(prevRequests => {
                        const exists = prevRequests.some(r => r.id === data.request.id)
                        if (exists) return prevRequests
                        return [data.request, ...prevRequests]
                    })
                }
                refreshSearchResults()
            })

            socket.on('friend-request-sent', (data) => {
                if (data.userId === user.id) {
                    setSentRequests(prevRequests => {
                        const exists = prevRequests.some(r => r.id === data.request.id)
                        if (exists) return prevRequests
                        return [data.request, ...prevRequests]
                    })
                }
                refreshSearchResults()
            })

            socket.on('friend-request-cancelled', (data) => {
                console.log('🔔 Socket: friend-request-cancelled event received:', data)
                if (data.userId === user.id) {
                    setPendingRequests(prevRequests =>
                        prevRequests.filter(r => r.id !== data.requestId)
                    )
                }
                setSentRequests(prevRequests =>
                    prevRequests.filter(r => r.id !== data.requestId)
                )
                refreshSearchResults()
            })

            socket.on('friend-added', (data) => {
                if (data.userId === user.id) {
                    setSentRequests(prevRequests =>
                        prevRequests.filter(r => r.receiver.id !== data.friendId)
                    );
                    setPendingRequests(prevRequests =>
                        prevRequests.filter(r => r.sender.id !== data.friendId)
                    );
                }
                refreshSearchResults()
            })

            socket.on('friend-removed', (data) => {
                refreshSearchResults()
            })

            return () => {
                console.log('🔌 Disconnecting socket:', socket.id)
                socket.disconnect()
            }
        }
    }, [user, refreshSearchResults])

    // Debounced user search with request cancellation
    React.useEffect(() => {
        let active = true;
        if (!searchQuery.trim() || searchQuery.length < 2) {
            setSearchResults([])
            setShowSearchResults(false)
            return
        }
        setSearching(true)
        const t = setTimeout(async () => {
            try {
                const res = await api.searchUsers(searchQuery)
                if (active) {
                    setSearchResults(res.users || [])
                    setShowSearchResults(true)
                }
            } catch (e) {
                if (active) setSearchResults([])
            } finally {
                if (active) setSearching(false)
            }
        }, 400)
        return () => {
            active = false;
            clearTimeout(t)
        }
    }, [searchQuery])

    return (
        <>
            <header className="sticky top-0 left-0 right-0 z-[100] glass-header">
                <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-16">
                        <div className="flex items-center gap-4">
                            <Link to="/" className="flex-shrink-0 flex items-center gap-2 text-xl font-bold">
                                <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-brand-accent-purple"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></svg>
                                P2P Hub
                            </Link>
                            {/* Responsive search box: always visible, stacked on mobile */}
                            <div className="w-full md:w-auto flex flex-col md:block mt-2 md:mt-0">
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-400 dark:text-brand-text-secondary"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                                    </div>
                                    <input
                                        type="text"
                                        placeholder="Search users by username..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        onFocus={() => searchQuery.length >= 2 && setShowSearchResults(true)}
                                        onBlur={() => setTimeout(() => setShowSearchResults(false), 200)}
                                        className="w-full bg-zinc-200/50 dark:bg-brand-bg py-2 pl-10 pr-4 rounded-xl border border-zinc-300 dark:border-brand-border/50 focus:outline-none focus:ring-2 focus:ring-brand-accent-purple transition"
                                    />
                                    {showSearchResults && (
                                        <div className="absolute top-full mt-2 w-full bg-white dark:bg-brand-surface rounded-xl shadow-2xl border border-zinc-200 dark:border-brand-border overflow-hidden z-[120]" style={{ maxHeight: '70vh', minWidth: '260px' }}>
                                            {searching && (
                                                <div className="p-3 text-sm text-zinc-500 dark:text-zinc-400 text-center">
                                                    Searching...
                                                </div>
                                            )}
                                            {!searching && friendError && (
                                                <div className="px-3 py-2 text-xs text-red-600 dark:text-red-400 border-b border-red-200/50 dark:border-red-900/40 bg-red-50/70 dark:bg-red-900/10">
                                                    {friendError}
                                                </div>
                                            )}
                                            {!searching && searchResults.length === 0 && (
                                                <div className="p-3 text-sm text-zinc-500 dark:text-zinc-400 text-center">
                                                    No users found
                                                </div>
                                            )}
                                            {!searching && searchResults.length > 0 && (
                                                <div className="overflow-y-auto" style={{ maxHeight: '60vh' }}>
                                                    {searchResults.map((result) => (
                                                        <div
                                                            key={result.id}
                                                            className="flex items-center gap-3 p-3 hover:bg-zinc-100 dark:hover:bg-brand-bg transition-colors border-b border-zinc-100 dark:border-zinc-800 last:border-0"
                                                        >
                                                            <div className="relative flex-shrink-0">
                                                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-semibold text-sm">
                                                                    {getUserInitials(result.name)}
                                                                </div>
                                                                <span
                                                                    title={result.online ? "Online" : "Offline"}
                                                                    className={`absolute -bottom-0.5 -right-0.5 block h-3 w-3 rounded-full ring-2 ring-white dark:ring-brand-surface ${result.online ? 'bg-green-500' : 'bg-red-500'}`}
                                                                />
                                                            </div>
                                                            <div className="flex-1 text-left min-w-0">
                                                                <div className="text-sm font-medium dark:text-brand-text-primary truncate">
                                                                    {result.name}
                                                                </div>
                                                                {result.username && (
                                                                    <div className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                                                                        @{result.username}
                                                                    </div>
                                                                )}
                                                            </div>
                                                            {result.friendStatus === 'none' && (
                                                                <button
                                                                    onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); handleSendFriendRequest(result.id) }}
                                                                    disabled={sendingRequest === result.id}
                                                                    className="flex-shrink-0 p-2 hover:bg-purple-100 dark:hover:bg-purple-900/20 rounded-lg transition-colors disabled:opacity-50"
                                                                    title="Send Friend Request"
                                                                    aria-label="Send Friend Request"
                                                                >
                                                                    {sendingRequest === result.id ? (
                                                                        <svg className="animate-spin h-5 w-5 text-purple-600 dark:text-purple-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                                                                        </svg>
                                                                    ) : (
                                                                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-purple-600 dark:text-purple-400">
                                                                            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                                                                            <circle cx="9" cy="7" r="4" />
                                                                            <line x1="19" y1="8" x2="19" y2="14" />
                                                                            <line x1="22" y1="11" x2="16" y2="11" />
                                                                        </svg>
                                                                    )}
                                                                </button>
                                                            )}
                                                            {result.friendStatus === 'request_sent' && (
                                                                <span className="flex-shrink-0 text-xs text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-3 py-1 rounded-full">
                                                                    Pending
                                                                </span>
                                                            )}
                                                            {result.friendStatus === 'request_received' && (
                                                                <span className="flex-shrink-0 text-xs text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/20 px-3 py-1 rounded-full">
                                                                    Respond
                                                                </span>
                                                            )}
                                                            {result.friendStatus === 'friends' && (
                                                                <span className="flex-shrink-0 text-xs text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/20 px-3 py-1 rounded-full">
                                                                    Friends
                                                                </span>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-4">
                            <button id="theme-toggle" type="button" onClick={onToggleTheme} className="text-zinc-500 dark:text-brand-text-secondary hover:bg-zinc-200 dark:hover:bg-brand-surface p-2 rounded-lg transition-colors">
                                <svg id="theme-toggle-dark-icon" className="w-5 h-5 dark:hidden" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z"></path></svg>
                                <svg id="theme-toggle-light-icon" className="w-5 h-5 hidden dark:block" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.707.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 100 2h1z" fillRule="evenodd" clipRule="evenodd"></path></svg>
                            </button>
                            <div className="relative">
                                <button
                                    onClick={() => setShowFriendRequests(!showFriendRequests)}
                                    className="relative text-zinc-500 dark:text-brand-text-secondary hover:text-zinc-900 dark:hover:text-brand-text-primary p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-brand-surface transition-colors"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                                        <circle cx="9" cy="7" r="4" />
                                        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                                        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                                    </svg>
                                    {pendingRequests.length > 0 && (
                                        <span className="absolute top-0 right-0 block h-5 w-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center font-semibold">
                                            {pendingRequests.length}
                                        </span>
                                    )}
                                </button>
                                {showFriendRequests && (
                                    <>
                                        <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-brand-surface rounded-xl shadow-2xl border border-zinc-200 dark:border-brand-border overflow-hidden z-50">
                                            <div className="p-3 border-b border-zinc-200 dark:border-brand-border">
                                                <h3 className="font-semibold text-sm dark:text-brand-text-primary mb-2">Friend Requests</h3>
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => setRequestsTab('received')}
                                                        className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${requestsTab === 'received'
                                                            ? 'bg-purple-600 text-white'
                                                            : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                                                            }`}
                                                    >
                                                        Received ({pendingRequests.length})
                                                    </button>
                                                    <button
                                                        onClick={() => setRequestsTab('sent')}
                                                        className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${requestsTab === 'sent'
                                                            ? 'bg-purple-600 text-white'
                                                            : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                                                            }`}
                                                    >
                                                        Sent ({sentRequests.length})
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="max-h-96 overflow-y-auto">
                                                {requestsTab === 'received' && (
                                                    <>
                                                        {pendingRequests.length === 0 ? (
                                                            <div className="p-4 text-sm text-zinc-500 dark:text-zinc-400 text-center">
                                                                No pending requests
                                                            </div>
                                                        ) : (
                                                            pendingRequests.map((request) => (
                                                                <div key={request.id} className="p-3 border-b border-zinc-100 dark:border-zinc-800 last:border-0 hover:bg-zinc-50 dark:hover:bg-brand-bg/50 transition-colors">
                                                                    <div className="flex items-center gap-3">
                                                                        <div className="relative flex-shrink-0">
                                                                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-semibold text-sm">
                                                                                {getUserInitials(request.sender.name)}
                                                                            </div>
                                                                            <span
                                                                                title={request.sender.online ? "Online" : "Offline"}
                                                                                className={`absolute -bottom-0.5 -right-0.5 block h-3 w-3 rounded-full ring-2 ring-white dark:ring-brand-surface ${request.sender.online ? 'bg-green-500' : 'bg-red-500'}`}
                                                                            />
                                                                        </div>
                                                                        <div className="flex-1 min-w-0">
                                                                            <div className="text-sm font-medium dark:text-brand-text-primary truncate">
                                                                                {request.sender.name}
                                                                            </div>
                                                                            <div className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                                                                                @{request.sender.username}
                                                                            </div>
                                                                        </div>
                                                                        <button
                                                                            onClick={() => handleAcceptRequest(request.id)}
                                                                            className="p-2 bg-green-100 hover:bg-green-200 dark:bg-green-900/30 dark:hover:bg-green-900/50 rounded-lg transition-colors"
                                                                            title="Accept"
                                                                        >
                                                                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-green-600 dark:text-green-400">
                                                                                <polyline points="20 6 9 17 4 12"></polyline>
                                                                            </svg>
                                                                        </button>
                                                                        <button
                                                                            onClick={() => handleRejectRequest(request.id)}
                                                                            className="p-2 bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 rounded-lg transition-colors"
                                                                            title="Delete"
                                                                        >
                                                                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-red-600 dark:text-red-400">
                                                                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                                                                <line x1="6" y1="6" x2="18" y2="18"></line>
                                                                            </svg>
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            ))
                                                        )}
                                                    </>
                                                )}
                                                {requestsTab === 'sent' && (
                                                    <>
                                                        {sentRequests.length === 0 ? (
                                                            <div className="p-4 text-sm text-zinc-500 dark:text-zinc-400 text-center">
                                                                No sent requests
                                                            </div>
                                                        ) : (
                                                            sentRequests.map((request) => (
                                                                <div key={request.id} className="p-3 border-b border-zinc-100 dark:border-zinc-800 last:border-0 hover:bg-zinc-50 dark:hover:bg-brand-bg/50 transition-colors">
                                                                    <div className="flex items-center gap-3">
                                                                        <div className="relative flex-shrink-0">
                                                                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-semibold text-sm">
                                                                                {getUserInitials(request.receiver.name)}
                                                                            </div>
                                                                            <span
                                                                                title={request.receiver.online ? "Online" : "Offline"}
                                                                                className={`absolute -bottom-0.5 -right-0.5 block h-3 w-3 rounded-full ring-2 ring-white dark:ring-brand-surface ${request.receiver.online ? 'bg-green-500' : 'bg-red-500'}`}
                                                                            />
                                                                        </div>
                                                                        <div className="flex-1 min-w-0">
                                                                            <div className="text-sm font-medium dark:text-brand-text-primary truncate">
                                                                                {request.receiver.name}
                                                                            </div>
                                                                            <div className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                                                                                @{request.receiver.username}
                                                                            </div>
                                                                        </div>
                                                                        <button
                                                                            onClick={() => handleCancelRequest(request.id)}
                                                                            className="p-2 bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 rounded-lg transition-colors"
                                                                            title="Cancel Request"
                                                                        >
                                                                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-red-600 dark:text-red-400">
                                                                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                                                                <line x1="6" y1="6" x2="18" y2="18"></line>
                                                                            </svg>
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            ))
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                            <div className="relative">
                                <button
                                    onClick={() => setShowDropdown(!showDropdown)}
                                    className="flex items-center gap-2 hover:bg-zinc-100 dark:hover:bg-brand-surface p-2 rounded-lg transition-colors"
                                >
                                    <div className="relative">
                                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-semibold text-sm">
                                            {getUserInitials(user?.name)}
                                        </div>
                                        <span
                                            title={isSocketConnected ? 'Online' : 'Offline'}
                                            className={`absolute -bottom-0.5 -right-0.5 block h-3 w-3 rounded-full ring-2 ring-white dark:ring-brand-surface ${isSocketConnected ? 'bg-green-500' : 'bg-red-500'}`}
                                        />
                                    </div>
                                    <div className="hidden md:block">
                                        <div className="font-medium text-sm dark:text-brand-text-primary">{user?.name || 'User'}</div>
                                        {user?.username && (
                                            <div className="text-xs text-zinc-500 dark:text-zinc-400">@{user.username}</div>
                                        )}
                                    </div>
                                </button>

                                {showDropdown && (
                                    <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-brand-surface rounded-xl shadow-2xl border border-zinc-200 dark:border-brand-border overflow-hidden z-50">
                                        <div className="p-3 border-b border-zinc-200 dark:border-brand-border">
                                            <div className="text-sm font-medium dark:text-brand-text-primary">{user?.name}</div>
                                            {user?.username && (
                                                <div className="text-xs text-zinc-500 dark:text-brand-text-secondary">@{user.username}</div>
                                            )}
                                            <div className="text-xs text-zinc-500 dark:text-brand-text-secondary">{user?.email}</div>
                                        </div>
                                        <button
                                            onClick={handleEditOpen}
                                            className="w-full flex items-center gap-2 px-4 py-3 hover:bg-zinc-100 dark:hover:bg-brand-bg text-brand-accent-purple transition-colors border-b border-zinc-200 dark:border-brand-border"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" /></svg>
                                            <span className="text-sm font-medium">Edit Profile</span>
                                        </button>
                                        <button
                                            onClick={handleDeleteAccountOpen}
                                            className="w-full flex items-center gap-2 px-4 py-3 hover:bg-zinc-100 dark:hover:bg-brand-bg text-orange-600 dark:text-orange-400 transition-colors border-b border-zinc-200 dark:border-brand-border"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                                            <span className="text-sm font-medium">Delete Account</span>
                                        </button>
                                        <button
                                            onClick={handleLogout}
                                            className="w-full flex items-center gap-2 px-4 py-3 hover:bg-zinc-100 dark:hover:bg-brand-bg text-red-600 dark:text-red-400 transition-colors"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                                            <span className="text-sm font-medium">Logout</span>
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </nav>
            </header>

            {/* Edit Profile Modal - rendered outside header for correct centering */}
            {showEdit && (
                <div
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40"
                    onClick={handleEditClose}
                    onKeyDown={(e) => { if (e.key === 'Escape') handleEditClose() }}
                    role="dialog"
                    aria-modal="true"
                >
                    <div
                        className="bg-white dark:bg-brand-surface rounded-2xl shadow-2xl w-full max-w-md mx-auto p-6 sm:p-8 relative max-h-[85vh] overflow-y-auto text-zinc-900 dark:text-zinc-100"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button
                            onClick={handleEditClose}
                            className="absolute top-4 right-4 text-zinc-500 hover:text-zinc-900 dark:text-brand-text-secondary dark:hover:text-brand-text-primary"
                            aria-label="Close"
                            disabled={saving}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                        </button>
                        <h2 className="text-xl font-bold mb-6 text-center">Edit Profile</h2>

                        {emailChangeStep === 1 ? (
                            /* Email verification step */
                            <form className="flex flex-col gap-4" onSubmit={handleVerifyEmailChange}>
                                <div className="text-center mb-2">
                                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                                        Verification code sent to:
                                    </p>
                                    <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                                        {pendingNewEmail}
                                    </p>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1 text-zinc-700 dark:text-zinc-300">
                                        6-Digit Verification Code
                                    </label>
                                    <input
                                        type="text"
                                        value={emailChangeCode}
                                        onChange={(e) => setEmailChangeCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                        className="w-full px-3 py-2 rounded-lg bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-brand-accent-purple text-center text-2xl tracking-widest"
                                        placeholder="000000"
                                        maxLength={6}
                                        required
                                    />
                                    <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400 text-center">
                                        Enter the code sent to your new email address. Code expires in 15 minutes.
                                    </p>
                                </div>
                                {emailChangeError && <div className="text-red-600 text-sm text-center">{emailChangeError}</div>}
                                {emailChangeMessage && <div className="text-green-600 text-sm text-center">{emailChangeMessage}</div>}
                                <div className="flex gap-3">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setEmailChangeStep(0)
                                            setEmailChangeCode('')
                                            setEmailChangeError('')
                                            setEmailChangeMessage('')
                                        }}
                                        disabled={emailChangeLoading}
                                        className="flex-1 py-2 px-4 bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 rounded-lg font-semibold hover:bg-zinc-300 dark:hover:bg-zinc-600 disabled:opacity-60 transition-colors"
                                    >
                                        Back
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={emailChangeLoading || emailChangeCode.length !== 6}
                                        className="flex-1 py-2 px-4 bg-brand-accent-purple text-white rounded-lg font-semibold hover:bg-brand-accent-purple/90 disabled:opacity-60 transition-colors"
                                    >
                                        {emailChangeLoading ? 'Verifying...' : 'Verify Email'}
                                    </button>
                                </div>
                            </form>
                        ) : (
                            /* Normal profile edit form */
                            <form className="flex flex-col gap-4" onSubmit={onSubmit}>
                                <div>
                                    <label className="block text-sm font-medium mb-1 text-zinc-700 dark:text-zinc-300">Name</label>
                                    <input
                                        name="name"
                                        value={fields.name}
                                        onChange={onChange}
                                        type="text"
                                        className="w-full px-3 py-2 rounded-lg bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-brand-accent-purple"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1 text-zinc-700 dark:text-zinc-300">Username</label>
                                    <input
                                        name="username"
                                        value={fields.username}
                                        onChange={onChange}
                                        type="text"
                                        className="w-full px-3 py-2 rounded-lg bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-brand-accent-purple"
                                        required
                                        minLength={3}
                                        maxLength={20}
                                        pattern="^[a-z0-9_.-]+$"
                                    />
                                    {fields.username.trim() !== (user?.username || '') && (
                                        <div className="mt-1 text-xs">
                                            {checkingUsername && <span className="text-zinc-500">Checking...</span>}
                                            {!checkingUsername && usernameAvailable === true && <span className="text-green-600">Username available</span>}
                                            {!checkingUsername && usernameAvailable === false && <span className="text-red-600">Username taken or invalid</span>}
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1 text-zinc-700 dark:text-zinc-300">Email</label>
                                    <input
                                        name="email"
                                        value={fields.email}
                                        onChange={onChange}
                                        type="email"
                                        className="w-full px-3 py-2 rounded-lg bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-brand-accent-purple"
                                        required
                                    />
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium mb-1 text-zinc-700 dark:text-zinc-300">Current Password</label>
                                        <div className="relative">
                                            <input
                                                name="password"
                                                value={fields.password}
                                                onChange={onChange}
                                                type={showCurrentPassword ? "text" : "password"}
                                                className="w-full px-3 py-2 pr-10 rounded-lg bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-brand-accent-purple"
                                                placeholder="Required to change password"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                                                className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors"
                                                aria-label={showCurrentPassword ? "Hide password" : "Show password"}
                                            >
                                                {showCurrentPassword ? (
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
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium mb-1 text-zinc-700 dark:text-zinc-300">New Password</label>
                                        <div className="relative">
                                            <input
                                                name="newPassword"
                                                value={fields.newPassword}
                                                onChange={onChange}
                                                type={showNewPassword ? "text" : "password"}
                                                className="w-full px-3 py-2 pr-10 rounded-lg bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-brand-accent-purple"
                                                placeholder="Leave blank to keep"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowNewPassword(!showNewPassword)}
                                                className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors"
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
                                    </div>
                                </div>
                                {error && <div className="text-red-600 text-sm text-center">{error}</div>}
                                {message && <div className="text-green-600 text-sm text-center">{message}</div>}
                                {emailChangeError && <div className="text-red-600 text-sm text-center">{emailChangeError}</div>}
                                {emailChangeMessage && <div className="text-green-600 text-sm text-center">{emailChangeMessage}</div>}
                                <button type="submit" disabled={saving || emailChangeLoading || (fields.username.trim() !== (user?.username || '') && usernameAvailable === false)} className="w-full py-2 px-4 bg-brand-accent-purple text-white rounded-lg font-semibold hover:bg-brand-accent-purple/90 disabled:opacity-60 transition-colors mt-2">
                                    {saving || emailChangeLoading ? 'Saving...' : 'Save Changes'}
                                </button>
                            </form>
                        )}
                    </div>
                </div>
            )}

            {/* Delete Account Modal */}
            {showDeleteAccount && (
                <div
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40"
                    onClick={handleDeleteAccountClose}
                    onKeyDown={(e) => { if (e.key === 'Escape') handleDeleteAccountClose() }}
                    role="dialog"
                    aria-modal="true"
                >
                    <div
                        className="bg-white dark:bg-brand-surface rounded-2xl shadow-2xl w-full max-w-md mx-auto p-6 sm:p-8 relative text-zinc-900 dark:text-zinc-100"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button
                            onClick={handleDeleteAccountClose}
                            className="absolute top-4 right-4 text-zinc-500 hover:text-zinc-900 dark:text-brand-text-secondary dark:hover:text-brand-text-primary"
                            aria-label="Close"
                            disabled={deletionLoading}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                        </button>

                        <div className="text-center mb-6">
                            <div className="mx-auto w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-4">
                                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-600 dark:text-red-400">
                                    <path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line>
                                </svg>
                            </div>
                            <h2 className="text-xl font-bold text-red-600 dark:text-red-400">Delete Account</h2>
                            <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-2">
                                {deletionStep === 1
                                    ? 'This action cannot be undone. All your data will be permanently deleted.'
                                    : 'Enter the 6-digit code sent to your email to confirm deletion.'}
                            </p>
                        </div>

                        {deletionStep === 1 && (
                            <div className="space-y-4">
                                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                                    <h3 className="font-semibold text-sm text-yellow-800 dark:text-yellow-300 mb-2">What will be deleted:</h3>
                                    <ul className="text-xs text-yellow-700 dark:text-yellow-400 space-y-1">
                                        <li>• Your profile and account information</li>
                                        <li>• Your friends list and friend requests</li>
                                        <li>• Any files shared through the platform</li>
                                    </ul>
                                </div>

                                {deletionError && (
                                    <div className="text-red-600 dark:text-red-400 text-sm text-center bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">
                                        {deletionError}
                                    </div>
                                )}
                                {deletionMessage && (
                                    <div className="text-green-600 dark:text-green-400 text-sm text-center bg-green-50 dark:bg-green-900/20 p-3 rounded-lg">
                                        {deletionMessage}
                                    </div>
                                )}

                                <button
                                    onClick={handleRequestDeletionCode}
                                    disabled={deletionLoading}
                                    className="w-full py-3 px-4 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold disabled:opacity-60 transition-colors"
                                >
                                    {deletionLoading ? 'Sending Code...' : 'Send Verification Code'}
                                </button>
                                <button
                                    onClick={handleDeleteAccountClose}
                                    disabled={deletionLoading}
                                    className="w-full py-3 px-4 bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 text-zinc-900 dark:text-zinc-100 rounded-lg font-semibold disabled:opacity-60 transition-colors"
                                >
                                    Cancel
                                </button>
                            </div>
                        )}

                        {deletionStep === 2 && (
                            <form onSubmit={handleDeleteAccountSubmit} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium mb-2 text-zinc-700 dark:text-zinc-300">
                                        Verification Code
                                    </label>
                                    <input
                                        type="text"
                                        value={deletionCode}
                                        onChange={(e) => setDeletionCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                        placeholder="Enter 6-digit code"
                                        maxLength={6}
                                        className="w-full px-4 py-3 rounded-lg bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 text-center text-2xl tracking-widest font-mono focus:outline-none focus:ring-2 focus:ring-red-500"
                                        required
                                        autoFocus
                                        disabled={deletionLoading}
                                    />
                                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-2 text-center">
                                        Code expires in 15 minutes
                                    </p>
                                </div>

                                {deletionError && (
                                    <div className="text-red-600 dark:text-red-400 text-sm text-center bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">
                                        {deletionError}
                                    </div>
                                )}
                                {deletionMessage && (
                                    <div className="text-green-600 dark:text-green-400 text-sm text-center bg-green-50 dark:bg-green-900/20 p-3 rounded-lg">
                                        {deletionMessage}
                                    </div>
                                )}

                                <button
                                    type="submit"
                                    disabled={deletionLoading || deletionCode.length !== 6}
                                    className="w-full py-3 px-4 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold disabled:opacity-60 transition-colors"
                                >
                                    {deletionLoading ? 'Deleting Account...' : 'Confirm Delete Account'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setDeletionStep(1)}
                                    disabled={deletionLoading}
                                    className="w-full py-3 px-4 bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 text-zinc-900 dark:text-zinc-100 rounded-lg font-semibold disabled:opacity-60 transition-colors"
                                >
                                    Back
                                </button>
                            </form>
                        )}
                    </div>
                </div>
            )}
        </>
    )
}
