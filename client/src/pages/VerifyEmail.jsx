import React, { useEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';

export default function VerifyEmail() {
    const { token } = useParams();
    const [status, setStatus] = useState('pending');
    const [message, setMessage] = useState('Verifying your email...');
    const hasVerified = useRef(false);

    const API_BASE = import.meta.env.DEV ? '' : (import.meta.env.VITE_API_URL || '');

    useEffect(() => {
        // Prevent double verification in React StrictMode
        if (hasVerified.current) return;
        hasVerified.current = true;

        async function verify() {
            try {
                const res = await fetch(`${API_BASE}/api/auth/verify-email/${token}`, {
                    credentials: 'include'
                });
                const data = await res.json();
                if (res.ok) {
                    setStatus('success');
                    setMessage(data.message || 'Email verified! You can now log in.');
                } else {
                    setStatus('error');
                    setMessage(data.error || 'Verification failed.');
                }
            } catch (err) {
                setStatus('error');
                setMessage('Server error. Please try again later.');
                console.error('Verification error:', err);
            }
        }
        verify();
    }, [token, API_BASE]);

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-white dark:bg-brand-bg text-zinc-900 dark:text-brand-text-primary">
            <div className="max-w-md w-full p-8 rounded-xl shadow-lg bg-white dark:bg-brand-surface border border-zinc-200 dark:border-brand-border">
                <h2 className="text-2xl font-bold mb-4">Email Verification</h2>
                <div className={`mb-6 p-3 rounded-xl text-center ${status === 'success' ? 'bg-green-100 text-green-700' : status === 'error' ? 'bg-red-100 text-red-700' : 'bg-zinc-100 text-zinc-700'}`}>
                    {message}
                </div>
                {status === 'success' && (
                    <Link to="/login" className="inline-block px-4 py-2 bg-brand-accent-purple text-white rounded-lg font-medium">Go to Login</Link>
                )}
                {status === 'error' && (
                    <div>
                        <ResendVerificationForm />
                    </div>
                )}
            </div>
        </div>
    );
}

function ResendVerificationForm() {
    const [email, setEmail] = useState('');
    const [resendStatus, setResendStatus] = useState('idle');
    const [resendMsg, setResendMsg] = useState('');

    const API_BASE = import.meta.env.DEV ? '' : (import.meta.env.VITE_API_URL || '');

    const handleResend = async (e) => {
        e.preventDefault();
        setResendStatus('pending');
        setResendMsg('');
        try {
            const res = await fetch(`${API_BASE}/api/auth/resend-verification`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ email })
            });
            const data = await res.json();
            if (res.ok) {
                setResendStatus('success');
                setResendMsg(data.message);
            } else {
                setResendStatus('error');
                setResendMsg(data.error || 'Could not resend email.');
            }
        } catch {
            setResendStatus('error');
            setResendMsg('Server error. Try again later.');
        }
    };

    return (
        <form onSubmit={handleResend} className="mt-4">
            <label className="block mb-2 font-medium">Enter your email to resend verification:</label>
            <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full px-3 py-2 border rounded mb-2"
                required
            />
            <button type="submit" className="px-4 py-2 bg-brand-accent-purple text-white rounded-lg font-medium">Resend Email</button>
            {resendStatus !== 'idle' && (
                <div className={`mt-2 text-sm ${resendStatus === 'success' ? 'text-green-700' : 'text-red-700'}`}>{resendMsg}</div>
            )}
        </form>
    );
}
