import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../utils/api';
import CryptoJS from 'crypto-js';

export default function ChatWindow({ user, friend }) {
    const { socket } = useAuth();
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(true);
    const [isFolded, setIsFolded] = useState(false); // Fold/unfold state
    const messagesEndRef = useRef(null);

    // Normalize user and friend IDs (handle both 'id' and '_id')
    const userId = user?.id || user?._id;
    const friendId = friend?.id || friend?._id;

    // Server handles encryption now - client just displays decrypted messages
    function decrypt(text) {
        // Messages are already decrypted by server before sending to client
        // This function is kept for backward compatibility but just returns text as-is
        return text;
    }

    // Fetch messages when chat window opens
    useEffect(() => {
        if (!userId || !friendId) return;

        async function fetchMessages() {
            try {
                setLoading(true);
                const data = await api.getMessages(friendId);
                // Decrypt ALL messages (both sent and received are encrypted in DB)
                const decryptedMessages = data.messages.map(msg => ({
                    from: msg.from,
                    text: decrypt(msg.text), // Decrypt all messages from database
                    createdAt: msg.createdAt
                }));
                setMessages(decryptedMessages);
            } catch (error) {
                console.error('Error fetching messages:', error);
            } finally {
                setLoading(false);
            }
        }

        fetchMessages();
    }, [userId, friendId]);

    useEffect(() => {
        if (!userId || !friendId || !socket) return;

        const handleChatMessage = (data) => {
            if ((data.from === userId && data.to === friendId) || (data.from === friendId && data.to === userId)) {
                const isSender = data.from === userId;
                setMessages(prev => [
                    ...prev,
                    {
                        from: data.from,
                        text: isSender ? data.text : decrypt(data.text),
                        createdAt: new Date().toISOString()
                    }
                ]);
            }
        };

        socket.on('chat-message', handleChatMessage);

        return () => {
            socket.off('chat-message', handleChatMessage);
        };
    }, [userId, friendId, socket]);

    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages]);

    const doSend = () => {
        if (!input.trim() || !socket) return;
        socket.emit('chat-message', { from: userId, to: friendId, text: input });
        setMessages(prev => [...prev, { from: userId, text: input, createdAt: new Date().toISOString() }]);
        setInput('');
    };

    const sendMessage = (e) => {
        e.preventDefault();
        doSend();
    };

    if (!userId || !friendId) {
        return (
            <div className="flex flex-col h-full items-center justify-center text-center p-8">
                <div className="text-red-500 text-lg font-bold mb-2">Unable to start chat</div>
                <div className="text-zinc-500">User or friend information is missing.<br />Please reload the page or check your login status.</div>
            </div>
        );
    }

    // Get friend's display info
    const friendName = friend?.name || friend?.username || 'Friend';
    const friendUsername = friend?.username || friend?.name || 'friend';
    const friendAvatar = friend?.avatar || friend?.profileImage || null;
    const friendInitial = friendName.charAt(0).toUpperCase();

    // Utility to generate a color from a string
    function stringToColor(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        const color = `hsl(${hash % 360}, 70%, 55%)`;
        return color;
    }
    const avatarColor = stringToColor(friendId || friendName);

    return (
        <div className={`flex flex-col ${isFolded ? 'h-[56px] min-h-[56px] max-h-[56px] bg-white/80 dark:bg-brand-surface/80 backdrop-blur-xl rounded-full shadow-lg border border-zinc-200/50 dark:border-brand-border/30 cursor-pointer hover:shadow-xl transition-all duration-300' : 'h-[600px] bg-white/70 dark:bg-brand-surface/70 backdrop-blur-xl rounded-2xl shadow-xl shadow-zinc-900/5 dark:shadow-zinc-950/50 border border-zinc-200/50 dark:border-brand-border/30 transition-all duration-300'}`}
            onClick={isFolded ? () => setIsFolded(false) : undefined}
            style={isFolded ? { width: '340px', alignSelf: 'flex-end' } : {}}
        >
            <div className={`flex items-center gap-3 ${isFolded ? 'px-4 py-2 rounded-full flex-shrink-0 w-full h-full' : 'px-6 py-4 border-b border-zinc-200/50 dark:border-brand-border/30 bg-white/50 dark:bg-brand-surface/50 backdrop-blur-lg rounded-t-2xl flex-shrink-0 justify-between'}`}>
                <div className="flex items-center gap-3">
                    <div className="relative">
                        {friendAvatar ? (
                            <img
                                src={friendAvatar}
                                className={`w-10 h-10 rounded-full object-cover border-2 border-green-400 ${isFolded ? '' : 'w-12 h-12'}`}
                                alt={friendName}
                                onError={(e) => {
                                    e.target.onerror = null;
                                    e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(friendName)}&background=22c55e&color=fff&size=128`;
                                }}
                            />
                        ) : (
                            <div className={`rounded-full flex items-center justify-center text-white font-bold border-2 ${isFolded ? 'w-10 h-10 text-lg' : 'w-12 h-12 text-xl'}`} style={{ background: avatarColor, borderColor: avatarColor }}>
                                {friendInitial}
                            </div>
                        )}
                        {friend?.online && (
                            <span className={`absolute -bottom-0.5 -right-0.5 block rounded-full bg-green-500 ring-2 ring-white dark:ring-brand-surface ${isFolded ? 'h-2.5 w-2.5' : 'h-3.5 w-3.5'}`}></span>
                        )}
                    </div>
                    <div className={isFolded ? "flex flex-col justify-center" : ""}>
                        <h3 className={`font-bold ${isFolded ? 'text-base' : 'text-lg'} dark:text-brand-text-primary`}>{friendName}</h3>
                        {!isFolded && <p className="text-sm text-zinc-500 dark:text-brand-text-secondary">@{friendUsername}</p>}
                    </div>
                </div>
                {/* Fold/Unfold Button */}
                {!isFolded ? (
                    <button
                        onClick={e => { e.stopPropagation(); setIsFolded(true); }}
                        className="ml-auto px-3 py-1 rounded-lg bg-blue-100 dark:bg-brand-bg text-blue-600 dark:text-brand-text-primary hover:bg-blue-200 dark:hover:bg-brand-surface transition-all"
                        title="Fold Chat"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                    </button>
                ) : (
                    <span className="ml-auto flex items-center gap-2 px-3 py-1 rounded-lg bg-blue-100 dark:bg-brand-bg text-blue-600 dark:text-brand-text-primary font-semibold cursor-pointer hover:bg-blue-200 dark:hover:bg-brand-surface transition-all">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                        <span>Open Chat</span>
                    </span>
                )}
            </div>
            {/* Chat area: only show if unfolded */}
            {!isFolded && (
                <>
                    <div className="flex-1 overflow-y-auto overflow-x-hidden px-6 py-4 space-y-3 scrollbar-hide">
                        {loading ? (
                            <div className="text-center text-zinc-400 py-8">Loading messages...</div>
                        ) : messages.length === 0 ? (
                            <div className="text-center text-zinc-400 py-8">No messages yet. Start the conversation!</div>
                        ) : (
                            messages.map((msg, idx) => (
                                <MessageBubble
                                    key={idx}
                                    isSender={msg.from === userId}
                                    text={msg.text}
                                    createdAt={msg.createdAt}
                                />
                            ))
                        )}
                        <div ref={messagesEndRef} />
                    </div>
                    <form onSubmit={sendMessage} className="flex items-end gap-3 px-6 py-4 border-t border-zinc-200/50 dark:border-brand-border/30 bg-white/50 dark:bg-brand-surface/50 backdrop-blur-lg rounded-b-2xl flex-shrink-0">
                        <AutoGrowTextarea
                            value={input}
                            onChange={setInput}
                            onEnterSend={doSend}
                        />
                        <button type="submit" className="px-5 py-2 rounded-xl bg-gradient-to-r from-blue-500 to-blue-400 text-white font-semibold shadow hover:scale-105 transition-transform">Send</button>
                    </form>
                </>
            )}
        </div>
    );
}

// Small helper component for an auto-growing textarea with Enter-to-send behavior
function AutoGrowTextarea({ value, onChange, onEnterSend }) {
    const ref = useRef(null);

    useEffect(() => {
        if (!ref.current) return;
        // Reset height to compute new scrollHeight
        ref.current.style.height = 'auto';
        const maxHeight = 160; // ~8 lines depending on line-height
        ref.current.style.height = Math.min(ref.current.scrollHeight, maxHeight) + 'px';
    }, [value]);

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            onEnterSend();
        }
    };

    return (
        <textarea
            ref={ref}
            className="flex-1 px-4 py-2 rounded-xl border border-zinc-300 dark:border-brand-border/50 focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm bg-zinc-50 dark:bg-brand-bg resize-none leading-relaxed scrollbar-hide"
            rows={1}
            placeholder="Type a message..."
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
        />
    );
}

// Utility: simple URL linkifier and fenced-code renderer
function MessageBubble({ isSender, text, createdAt }) {
    const [copied, setCopied] = useState(false);

    // Detect ```lang\n...``` fenced blocks; fallback to plain text with linkify
    const isFenced = /^```[\s\S]*```\s*$/.test(text.trim());

    const copyToClipboard = async () => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
        } catch (e) {
            console.warn('Copy failed', e);
        }
    };

    const formattedTime = createdAt ? new Date(createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

    const bubbleBase = `inline-block px-4 py-2 rounded-2xl max-w-[85%] sm:max-w-[70%] shadow-md overflow-hidden group relative`;
    const bubbleColors = isSender
        ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white'
        : 'bg-white/80 dark:bg-zinc-800/80 backdrop-blur-md text-zinc-900 dark:text-brand-text-primary border border-zinc-200/50 dark:border-zinc-700/50';

    return (
        <div className={`flex ${isSender ? 'justify-end' : 'justify-start'}`}>
            <div className={`${bubbleBase} ${bubbleColors}`}>
                {/* Copy button on hover */}
                <button
                    onClick={copyToClipboard}
                    className={`absolute ${isSender ? 'left-2' : 'right-2'} top-2 opacity-0 group-hover:opacity-100 transition-opacity text-xs px-2 py-1 rounded-md ${isSender ? 'bg-white/20 text-white' : 'bg-zinc-200/80 text-zinc-700'} hover:scale-105`}
                    title="Copy"
                >
                    {copied ? 'Copied' : 'Copy'}
                </button>

                {/* Content */}
                {isFenced ? (
                    <pre className="whitespace-pre-wrap break-words break-all leading-relaxed font-mono text-sm">
                        {text.replace(/^```/, '').replace(/```\s*$/, '')}
                    </pre>
                ) : (
                    <p className="whitespace-pre-wrap break-words break-all leading-relaxed">
                        {linkify(text)}
                    </p>
                )}

                {/* Timestamp */}
                {formattedTime && (
                    <div className={`mt-1 text-[10px] ${isSender ? 'text-white/80' : 'text-zinc-500 dark:text-zinc-400'} select-none text-right`}>
                        {formattedTime}
                    </div>
                )}
            </div>
        </div>
    );
}

function linkify(text) {
    // Basic URL regex; avoids matching trailing punctuation
    const urlRegex = /(https?:\/\/[^\s)]+[^\s.,)\]]?)/gi;
    const parts = [];
    let lastIndex = 0;
    let match;
    while ((match = urlRegex.exec(text)) !== null) {
        const [url] = match;
        const start = match.index;
        if (start > lastIndex) parts.push(text.slice(lastIndex, start));
        parts.push(
            <a
                key={`${start}-${url}`}
                href={url}
                target="_blank"
                rel="noreferrer noopener"
                className="underline decoration-dotted hover:decoration-solid text-blue-600 dark:text-blue-400 break-all"
            >
                {url}
            </a>
        );
        lastIndex = start + url.length;
    }
    if (lastIndex < text.length) parts.push(text.slice(lastIndex));
    return parts;
}
