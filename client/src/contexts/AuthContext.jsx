import React, { createContext, useState, useEffect, useContext, useRef } from 'react'
import { api } from '../utils/api'
import { io } from 'socket.io-client'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [isSocketConnected, setIsSocketConnected] = useState(false)
    const socketRef = useRef(null)

    // Check if user is already logged in on mount
    useEffect(() => {
        checkAuth()
    }, [])

    // Connect to Socket.IO ALWAYS (for real-time collaboration without auth)
    useEffect(() => {
        // Connect to Socket.IO server
        // In dev, use same-origin to leverage Vite proxy; in prod, use VITE_API_URL
        const socket = io(import.meta.env.DEV ? undefined : (import.meta.env.VITE_API_URL || undefined), {
            withCredentials: true
        })

        socketRef.current = socket

        socket.on('connect', () => {
            console.log('Socket.IO connected')
            setIsSocketConnected(true)
            // Emit user-online event with userId if authenticated
            if (user) {
                socket.emit('user-online', { userId: user.id })
            }
        })

        socket.on('disconnect', () => {
            console.log('Socket.IO disconnected')
            setIsSocketConnected(false)
        })

        // Cleanup on unmount
        return () => {
            socket.disconnect()
            socketRef.current = null
            setIsSocketConnected(false)
        }
    }, []) // Empty deps - only run once on mount

    // Update user-online status when user changes
    useEffect(() => {
        if (socketRef.current && socketRef.current.connected && user) {
            socketRef.current.emit('user-online', { userId: user.id })
        }
    }, [user])

    async function checkAuth() {
        try {
            setLoading(true)
            const data = await api.getCurrentUser()
            setUser(data.user)
            setError(null)
        } catch (err) {
            // User not logged in or token expired
            console.log('Auth check failed:', err.message)
            setUser(null)
            setError(null)
        } finally {
            setLoading(false)
        }
    }

    async function register(name, username, email, password) {
        try {
            setError(null)
            const data = await api.register(name, username, email, password)
            setUser(data.user)
            return { success: true }
        } catch (err) {
            setError(err.message)
            return { success: false, error: err.message }
        }
    }

    async function login(email, password) {
        try {
            setError(null)
            const data = await api.login(email, password)
            setUser(data.user)
            return { success: true }
        } catch (err) {
            setError(err.message)
            return { success: false, error: err.message }
        }
    }

    async function logout() {
        try {
            await api.logout()
            // Clear all transfer-related localStorage keys
            try {
                localStorage.removeItem('transfer:meta')
                localStorage.removeItem('transfer:session')
                localStorage.removeItem('transfer:pending')
                localStorage.removeItem('transfer:approval')
                // Remove all transfer:rx:* manifests
                Object.keys(localStorage).forEach(k => { if (k.startsWith('transfer:rx:')) localStorage.removeItem(k) })
            } catch { }
            // Clear all transfer files from IndexedDB
            try {
                const { clearStore } = await import('../utils/idb')
                await clearStore()
            } catch { }
            setUser(null)
            return { success: true }
        } catch (err) {
            console.error('Logout error:', err)
            return { success: false, error: err.message }
        }
    }

    async function updateProfile(fields) {
        try {
            setError(null)
            const data = await api.updateProfile(fields)
            setUser(data.user)
            return { success: true, user: data.user }
        } catch (err) {
            setError(err.message)
            return { success: false, error: err.message }
        }
    }

    const value = {
        user,
        loading,
        error,
        isSocketConnected,
        socket: socketRef.current,
        register,
        login,
        logout,
        updateProfile,
        isAuthenticated: !!user,
    }

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
    const context = useContext(AuthContext)
    if (!context) {
        throw new Error('useAuth must be used within AuthProvider')
    }
    return context
}
