// API utility for making requests to the backend
// Use relative path in development so Vite proxy keeps cookies first-party; use VITE_API_URL only in production
const API_BASE = import.meta.env.DEV ? '' : (import.meta.env.VITE_API_URL || '')

// Global flag to track if we're handling 401
let handling401 = false

export async function apiRequest(path, options = {}) {
    const response = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...options.headers,
        },
        credentials: 'include', // Important: include cookies for auth
    })

    // Try to parse JSON safely; handle empty or non-JSON bodies
    let data
    const text = await response.text().catch(() => '')
    try {
        data = text ? JSON.parse(text) : null
    } catch {
        data = null
    }

    if (!response.ok) {
        const message = (data && (data.error || data.message)) || text || `Request failed with ${response.status}`

        // Handle 401 Unauthorized - session expired or invalid
        // Instead of redirecting globally (which breaks public pages that make unauthenticated calls),
        // emit a global event so protected-route components can react and decide to redirect.
        if (response.status === 401 && !path.includes('/api/auth/me')) {
            try {
                // Dispatch a cancellable event in case a caller wants to intercept
                const ev = new CustomEvent('app:unauthorized', { detail: { path } })
                window.dispatchEvent(ev)
            } catch (e) { /* ignore */ }

            const err = new Error(message)
            err.status = 401
            throw err
        }

        throw new Error(message)
    }

    // Some endpoints (e.g., logout) may return 204 No Content
    return data ?? {}
}

export const api = {
    // Auth endpoints
    register: (name, username, email, password) =>
        apiRequest('/api/auth/register', {
            method: 'POST',
            body: JSON.stringify({ name, username, email, password }),
        }),

    login: (email, password) =>
        apiRequest('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password }),
        }),

    getCurrentUser: () => apiRequest('/api/auth/me'),

    logout: () =>
        apiRequest('/api/auth/logout', { method: 'POST' }),

    checkUsername: (username) =>
        apiRequest(`/api/auth/check-username?username=${encodeURIComponent(username)}`),

    updateProfile: (payload) =>
        apiRequest('/api/auth/me', {
            method: 'PATCH',
            body: JSON.stringify(payload),
        }),

    searchUsers: (query) =>
        apiRequest(`/api/auth/search?q=${encodeURIComponent(query)}`),

    // Friend request endpoints
    sendFriendRequest: (receiverId) =>
        apiRequest('/api/auth/friend-request/send', {
            method: 'POST',
            body: JSON.stringify({ receiverId }),
        }),

    getPendingRequests: () =>
        apiRequest('/api/auth/friend-request/pending'),

    getSentRequests: () =>
        apiRequest('/api/auth/friend-request/sent'),

    acceptFriendRequest: (requestId) =>
        apiRequest('/api/auth/friend-request/accept', {
            method: 'POST',
            body: JSON.stringify({ requestId }),
        }),

    rejectFriendRequest: (requestId) =>
        apiRequest('/api/auth/friend-request/reject', {
            method: 'POST',
            body: JSON.stringify({ requestId }),
        }),

    cancelFriendRequest: (requestId) =>
        apiRequest('/api/auth/friend-request/cancel', {
            method: 'POST',
            body: JSON.stringify({ requestId }),
        }),

    getFriends: () =>
        apiRequest('/api/auth/friends'),

    removeFriend: (friendId) =>
        apiRequest('/api/auth/friend/remove', {
            method: 'POST',
            body: JSON.stringify({ friendId }),
        }),

    // Message endpoints
    getMessages: (friendId) =>
        apiRequest(`/api/messages/${friendId}`),

    // Account deletion endpoints
    requestAccountDeletion: (email) =>
        apiRequest('/api/auth/request-account-deletion', {
            method: 'POST',
            body: JSON.stringify({ email }),
        }),

    deleteAccount: (email, code) =>
        apiRequest('/api/auth/delete-account', {
            method: 'POST',
            body: JSON.stringify({ email, code }),
        }),

    // Email change endpoints
    requestEmailChange: (newEmail) =>
        apiRequest('/api/auth/request-email-change', {
            method: 'POST',
            body: JSON.stringify({ newEmail }),
        }),

    verifyEmailChange: (code) =>
        apiRequest('/api/auth/verify-email-change', {
            method: 'POST',
            body: JSON.stringify({ code }),
        }),

    // Notes endpoints
    checkSlug: (slug) =>
        apiRequest('/api/notes/check-slug', {
            method: 'POST',
            body: JSON.stringify({ slug }),
        }),

    createNote: (noteData) =>
        apiRequest('/api/notes', {
            method: 'POST',
            body: JSON.stringify(noteData),
        }),

    getNotes: () =>
        apiRequest('/api/notes'),

    // Special-case: for password-protected public notes the server returns 401 with { requiresPassword: true }
    // We should not throw in that case; instead, return the payload so the UI can show the password prompt.
    getNoteBySlug: async (slug) => {
        const res = await fetch(`${API_BASE}/api/notes/slug/${slug}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
            credentials: 'include',
        })

        let data
        const text = await res.text().catch(() => '')
        try {
            data = text ? JSON.parse(text) : null
        } catch {
            data = null
        }

        // If server indicates password is required, return payload instead of throwing
        if (res.status === 401 && data && data.requiresPassword) {
            return data
        }

        if (!res.ok) {
            const message = (data && (data.error || data.message)) || text || `Request failed with ${res.status}`
            throw new Error(message)
        }

        return data ?? {}
    },

    verifyNotePassword: (slug, password) =>
        apiRequest(`/api/notes/${slug}/verify-password`, {
            method: 'POST',
            body: JSON.stringify({ password }),
        }),

    updateNote: (id, updates) =>
        apiRequest(`/api/notes/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(updates),
        }),

    updateNoteBySlug: (slug, updates) =>
        apiRequest(`/api/notes/slug/${slug}`, {
            method: 'PATCH',
            body: JSON.stringify(updates),
        }),

    updateNoteSettings: (id, settings) =>
        apiRequest(`/api/notes/${id}/settings`, {
            method: 'PATCH',
            body: JSON.stringify(settings),
        }),

    deleteNote: (id) =>
        apiRequest(`/api/notes/${id}`, {
            method: 'DELETE',
        }),

    getNoteCollaborators: (slug) =>
        apiRequest(`/api/notes/${slug}/collaborators`),

    addCollaborator: (id, userId, permission) =>
        apiRequest(`/api/notes/${id}/collaborators`, {
            method: 'POST',
            body: JSON.stringify({ userId, permission }),
        }),

    removeCollaborator: (id, userId) =>
        apiRequest(`/api/notes/${id}/collaborators/${userId}`, {
            method: 'DELETE',
        }),
}

