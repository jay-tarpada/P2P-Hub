import React from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import LandingPage from './components/LandingPage'
import About from './pages/About'
import Contact from './pages/Contact'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Dashboard from './pages/Dashboard'
import ProtectedRoute from './components/ProtectedRoute'
import Transfer from './pages/Transfer'
import { TransferProvider } from './contexts/TransferContext'
import VerifyEmail from './pages/VerifyEmail'
import ResetPassword from './pages/ResetPassword'
import NotesPage from './pages/NotesPage'
import NoteEditorPage from './pages/NoteEditorPage'

export default function App() {
    return (
        <BrowserRouter>
            <TransferProvider>
                <Routes>
                    <Route path="/" element={<LandingPage />} />
                    <Route path="/about" element={<About />} />
                    <Route path="/contact" element={<Contact />} />
                    <Route path="/login" element={<Login />} />
                    <Route path="/signup" element={<Signup />} />
                    <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />

                    {/* Notes routes */}
                    <Route path="/dashboard/notes" element={<ProtectedRoute><NotesPage /></ProtectedRoute>} />
                    <Route path="/dashboard/notes/new" element={<ProtectedRoute><NoteEditorPage /></ProtectedRoute>} />
                    <Route path="/dashboard/notes/:slug/edit" element={<ProtectedRoute><NoteEditorPage /></ProtectedRoute>} />

                    {/* Public note access */}
                    <Route path="/notes/:slug" element={<NoteEditorPage />} />

                    {/* Transfer routes (public) */}
                    <Route path="/transfer" element={<Transfer />} />
                    <Route path="/transfer/:id" element={<Transfer />} />
                    <Route path="/verify-email/:token" element={<VerifyEmail />} />
                    <Route path="/reset-password/:token" element={<ResetPassword />} />
                </Routes>
            </TransferProvider>
        </BrowserRouter>
    )
}
