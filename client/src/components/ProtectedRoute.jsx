import React from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'

export default function ProtectedRoute({ children }) {
    const { user, loading } = useAuth()
    const navigate = useNavigate()

    React.useEffect(() => {
        const onUnauthorized = () => {
            // If user is not authenticated (or session expired), send them to login
            if (!user) {
                navigate('/login')
            }
        }
        window.addEventListener('app:unauthorized', onUnauthorized)
        return () => window.removeEventListener('app:unauthorized', onUnauthorized)
    }, [user, navigate])

    // Show loading state while checking auth
    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-brand-dark">
                <div className="text-center">
                    <div className="w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-gray-600 dark:text-brand-text-secondary">Loading...</p>
                </div>
            </div>
        )
    }

    // Redirect to login if not authenticated
    if (!user) {
        return <Navigate to="/login" replace />
    }

    // Render children if authenticated
    return children
}
