import React, { useState, useEffect } from 'react'
import { api } from '../utils/api'
import { useAuth } from '../contexts/AuthContext'
import { io } from 'socket.io-client'

export default function FriendsList({ onChat }) {
    const { user, socket } = useAuth()
    const [friends, setFriends] = useState([])
    const [loading, setLoading] = useState(true)
    const [removingFriendId, setRemovingFriendId] = useState(null)
    const [showConfirmDialog, setShowConfirmDialog] = useState(false)
    const [friendToRemove, setFriendToRemove] = useState(null)
    const [unreadMessages, setUnreadMessages] = useState({}) // Track unread messages per friend

    const getUserInitials = (name) => {
        if (!name) return 'U'
        return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    }

    const loadFriends = async () => {
        try {
            setLoading(true)
            const res = await api.getFriends()
            setFriends(res.friends || [])
        } catch (error) {
            console.error('Failed to load friends:', error)
        } finally {
            setLoading(false)
        }
    }

    const handleRemoveFriendClick = (friend) => {
        setFriendToRemove(friend)
        setShowConfirmDialog(true)
    }

    const handleConfirmRemove = async () => {
        if (!friendToRemove) return

        try {
            setRemovingFriendId(friendToRemove.id)
            await api.removeFriend(friendToRemove.id)
            // Don't reload - Socket.IO will handle the update in real-time
            setShowConfirmDialog(false)
            setFriendToRemove(null)
        } catch (error) {
            console.error('Failed to remove friend:', error)
            alert('Failed to remove friend. Please try again.')
        } finally {
            setRemovingFriendId(null)
        }
    }

    const handleCancelRemove = () => {
        setShowConfirmDialog(false)
        setFriendToRemove(null)
    }

    const handleChatClick = (friend) => {
        // Clear unread messages for this friend
        setUnreadMessages(prev => {
            const updated = { ...prev };
            delete updated[friend.id];
            return updated;
        });

        // Call the parent's onChat handler
        if (onChat) onChat(friend);
    }

    useEffect(() => {
        loadFriends()

        if (!socket || !user) return;

        // Listen for incoming chat messages to track unread
        const handleChatMessage = (data) => {
            // Only track if message is TO current user (not FROM)
            if (data.to === user.id && data.from !== user.id) {
                setUnreadMessages(prev => ({
                    ...prev,
                    [data.from]: (prev[data.from] || 0) + 1
                }));
            }
        };

        socket.on('chat-message', handleChatMessage);

        // Listen for real-time friend additions and removals via Socket.IO
        socket.on('friend-added', (data) => {
            // Only add the friend if the event is for the current user
            if (user && data.userId === user.id) {
                setFriends(prevFriends => {
                    // Check if friend already exists
                    const exists = prevFriends.some(f => f.id === data.friend.id)
                    if (exists) return prevFriends

                    // Add new friend to the list
                    return [...prevFriends, data.friend]
                })
            }
        })

        socket.on('friend-removed', (data) => {
            // Remove friend if the event is for the current user
            if (user && data.userId === user.id) {
                setFriends(prevFriends =>
                    prevFriends.filter(f => f.id !== data.friendId)
                )
            }
        })

        return () => {
            socket.off('chat-message', handleChatMessage);
            socket.off('friend-added');
            socket.off('friend-removed');
        }
    }, [user, socket])

    if (loading) {
        return (
            <div className="bg-white/70 dark:bg-brand-surface/70 backdrop-blur-xl p-6 rounded-2xl border border-zinc-200/50 dark:border-brand-border/30 shadow-xl shadow-zinc-900/5 dark:shadow-zinc-950/50">
                <h2 className="font-bold text-lg mb-4">Friends</h2>
                <div className="text-center text-sm text-zinc-500 dark:text-zinc-400 py-8">
                    Loading friends...
                </div>
            </div>
        )
    }

    return (
        <div className="bg-white/70 dark:bg-brand-surface/70 backdrop-blur-xl p-6 rounded-2xl border border-zinc-200/50 dark:border-brand-border/30 shadow-xl shadow-zinc-900/5 dark:shadow-zinc-950/50">
            <div className="flex justify-between items-center mb-4">
                <h2 className="font-bold text-lg">Friends</h2>
                <div className="flex items-center gap-2">
                    <button
                        onClick={loadFriends}
                        disabled={loading}
                        className="p-1.5 hover:bg-zinc-100 dark:hover:bg-brand-bg rounded-lg transition-colors disabled:opacity-50"
                        title="Refresh"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-500 dark:text-zinc-400">
                            <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
                        </svg>
                    </button>
                    <span className="text-sm text-zinc-500 dark:text-zinc-400">
                        {friends.length} {friends.length === 1 ? 'friend' : 'friends'}
                    </span>
                </div>
            </div>

            {friends.length === 0 ? (
                <div className="text-center py-8">
                    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-3 text-zinc-300 dark:text-zinc-700">
                        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-2">No friends yet</p>
                    <p className="text-xs text-zinc-400 dark:text-zinc-500">
                        Search for users and send friend requests to connect
                    </p>
                </div>
            ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                    {friends.map((friend) => (
                        <div
                            key={friend.id}
                            className="flex items-center gap-3 p-3 rounded-xl hover:bg-zinc-50 dark:hover:bg-brand-bg transition-colors"
                        >
                            <div className="relative flex-shrink-0">
                                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-semibold">
                                    {getUserInitials(friend.name)}
                                </div>
                                <span
                                    title={friend.online ? "Online" : "Offline"}
                                    className={`absolute -bottom-0.5 -right-0.5 block h-3.5 w-3.5 rounded-full ring-2 ring-white dark:ring-brand-surface ${friend.online ? 'bg-green-500' : 'bg-red-500'}`}
                                />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="font-medium text-sm dark:text-brand-text-primary truncate">
                                    {friend.name}
                                </div>
                                {friend.username && (
                                    <div className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                                        @{friend.username}
                                    </div>
                                )}
                            </div>
                            <div className="flex items-center gap-1">
                                <button
                                    className="relative flex-shrink-0 p-2 hover:bg-purple-100 dark:hover:bg-purple-900/20 rounded-lg transition-colors"
                                    title="Start chat"
                                    onClick={() => handleChatClick(friend)}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-purple-600 dark:text-purple-400">
                                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                                    </svg>
                                    {unreadMessages[friend.id] > 0 && (
                                        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center ring-2 ring-white dark:ring-brand-surface">
                                            {unreadMessages[friend.id] > 9 ? '9+' : unreadMessages[friend.id]}
                                        </span>
                                    )}
                                </button>
                                <button
                                    onClick={() => handleRemoveFriendClick(friend)}
                                    disabled={removingFriendId === friend.id}
                                    className="flex-shrink-0 p-2 hover:bg-red-100 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50"
                                    title="Remove friend"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-600 dark:text-red-400">
                                        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                                        <circle cx="9" cy="7" r="4" />
                                        <line x1="17" y1="8" x2="22" y2="13" />
                                        <line x1="22" y1="8" x2="17" y2="13" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Confirmation Dialog */}
            {showConfirmDialog && friendToRemove && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-white dark:bg-brand-surface rounded-2xl border border-zinc-200 dark:border-brand-border/50 p-6 max-w-md w-full shadow-2xl">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center">
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-600 dark:text-red-400">
                                    <circle cx="12" cy="12" r="10" />
                                    <line x1="15" y1="9" x2="9" y2="15" />
                                    <line x1="9" y1="9" x2="15" y2="15" />
                                </svg>
                            </div>
                            <div>
                                <h3 className="font-bold text-lg dark:text-brand-text-primary">Remove Friend</h3>
                                <p className="text-sm text-zinc-500 dark:text-zinc-400">This action cannot be undone</p>
                            </div>
                        </div>
                        <p className="text-sm text-zinc-700 dark:text-zinc-300 mb-6">
                            Are you sure you want to remove <span className="font-semibold">{friendToRemove.name}</span> from your friends list?
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={handleCancelRemove}
                                disabled={removingFriendId === friendToRemove.id}
                                className="flex-1 px-4 py-2.5 rounded-xl bg-zinc-100 dark:bg-brand-bg hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-100 font-medium transition-colors disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleConfirmRemove}
                                disabled={removingFriendId === friendToRemove.id}
                                className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-medium transition-colors disabled:opacity-50"
                            >
                                {removingFriendId === friendToRemove.id ? 'Removing...' : 'Remove'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
