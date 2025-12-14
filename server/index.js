const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '.env') })
const express = require('express')
const http = require('http')
const cors = require('cors')
const cookieParser = require('cookie-parser')
const session = require('express-session')
const mongoose = require('mongoose')
const { Server } = require('socket.io')
const crypto = require('crypto')
const mongoSanitize = require('express-mongo-sanitize')

const authRoutes = require('./routes/auth')
const messagesRoutes = require('./routes/messages')
const notesRoutes = require('./routes/notes')
const Message = require('./models/Message')
const sessionTimeoutMiddleware = require('./session')
const csrfProtection = require('./csrf')

const app = express()
const isProd = process.env.NODE_ENV === 'production'
let dbConnected = false

// Middleware
// Allow configuring allowed origins for CORS from env (comma-separated)
const DEFAULT_ORIGINS = ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:3000']
const ORIGIN_LIST = (process.env.CLIENT_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean)
// In dev, reflect request origin to simplify LAN/mobile testing with credentials
const corsOrigin = (origin, callback) => {
    const allowed = ORIGIN_LIST.length ? ORIGIN_LIST : DEFAULT_ORIGINS
    if (!origin) return callback(null, true) // non-browser or same-origin
    if (!isProd) return callback(null, true)
    if (allowed.includes(origin)) return callback(null, true)
    return callback(new Error(`CORS: Origin ${origin} not allowed`))
}
app.use(cors({ origin: corsOrigin, credentials: true }))
app.use(express.json())
app.use(cookieParser())

// Configure express-session for password verification storage
app.use(session({
    secret: process.env.SESSION_SECRET || 'dev-session-secret-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: isProd, // true in production (requires HTTPS)
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}))

// MongoDB injection prevention - sanitize user input
app.use(mongoSanitize())

// Session timeout and CSRF protection
// app.use(sessionTimeoutMiddleware)
// Do NOT apply csrfProtection globally. Apply per route as needed.

// Example: Apply CSRF protection to a specific POST route
app.post('/api/csrf-check', csrfProtection, (req, res) => {
    res.json({ csrfToken: req.csrfToken() })
})

// Routes
app.use('/api/auth', authRoutes)
app.use('/api', messagesRoutes)
app.use('/api/notes', notesRoutes)

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' })
})

// Check if transfer room requires password
app.get('/api/transfer/:roomId/check', (req, res) => {
    const { roomId } = req.params
    const room = Array.from(io.of('/').sockets.values()).find(s => s.data.roomId === roomId && s.data.role === 'sender')
    const roomData = transferRooms.get(roomId)

    if (!roomData) {
        return res.json({ exists: false, requiresPassword: false })
    }

    res.json({
        exists: true,
        requiresPassword: !!roomData.passwordHash
    })
})

const server = http.createServer(app)
const io = new Server(server, {
    cors: {
        origin: corsOrigin,
        methods: ['GET', 'POST'],
        credentials: true
    }
})

// Track online users by userId
const onlineUsers = new Map() // userId -> Set of socketIds

// Track active transfer rooms to prevent multiple receivers
// roomId -> { sender: socketId, receiver: socketId | null, approved: boolean, passwordHash: string | null }
const transferRooms = new Map()

// AES encryption helpers
const ENCRYPTION_KEY = process.env.CHAT_ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex'); // 32 bytes for AES-256
const IV_LENGTH = 16; // AES block size
function encrypt(text) {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
}
function decrypt(text) {
    const parts = text.split(':');
    const iv = Buffer.from(parts.shift(), 'hex');
    const encryptedText = parts.join(':');
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

// Socket.IO signaling for WebRTC
io.on('connection', (socket) => {

    // Register user as online
    socket.on('user-online', ({ userId }) => {
        if (!userId) return
        if (!onlineUsers.has(userId)) {
            onlineUsers.set(userId, new Set())
        }
        onlineUsers.get(userId).add(socket.id)
        socket.data.userId = userId
        io.emit('user-status-changed', { userId, online: true })
    })

    socket.on('create-room', ({ roomId }) => {
        socket.join(roomId)
        socket.data.roomId = roomId
    })

    socket.on('join-room', ({ roomId, passwordHash }) => {
        if (!roomId) return

        const room = transferRooms.get(roomId)

        // If room doesn't exist, this is the sender (first to join)
        if (!room) {
            transferRooms.set(roomId, { sender: socket.id, receiver: null, approved: false, passwordHash: passwordHash || null })
            socket.join(roomId)
            socket.data.roomId = roomId
            socket.data.role = 'sender'
            return
        }

        // If sender is joining again (reconnect/refresh) or taking over an empty sender slot
        if (room.sender === socket.id || !room.sender) {
            room.sender = socket.id
            socket.join(roomId)
            socket.data.roomId = roomId
            socket.data.role = 'sender'
            // Update password if provided
            if (passwordHash !== undefined) {
                room.passwordHash = passwordHash
            }
            return
        }

        // If this is a receiver attempting to join
        // Check if password is required and validate it
        if (room.passwordHash && room.passwordHash !== passwordHash) {
            socket.emit('transfer-error', {
                reason: 'Incorrect password. Please try again.',
                requiresPassword: true
            })
            return
        }

        // Check if a receiver is already connected
        if (room.receiver && room.receiver !== socket.id) {
            // Another receiver is already active
            socket.emit('transfer-error', {
                reason: 'This transfer is already in progress with another device. Please wait or request a new link.'
            })
            return
        }

        // Allow this receiver to join
        room.receiver = socket.id
        socket.join(roomId)
        socket.data.roomId = roomId
        socket.data.role = 'receiver'
        socket.to(roomId).emit('peer-joined', { id: socket.id })
    })

    socket.on('offer', (data) => {
        // Support both direct offers (to: socketId) and room broadcasts (roomId)
        if (data.to) {
            io.to(data.to).emit('offer', { from: socket.id, sdp: data.sdp })
        } else if (data.roomId) {
            socket.to(data.roomId).emit('offer', { from: socket.id, sdp: data.sdp })
        }
    })

    socket.on('answer', ({ to, sdp }) => {
        io.to(to).emit('answer', { from: socket.id, sdp })
    })

    socket.on('ice-candidate', ({ to, candidate }) => {
        if (to) {
            io.to(to).emit('ice-candidate', { from: socket.id, candidate })
        } else if (socket.data.roomId) {
            socket.to(socket.data.roomId).emit('ice-candidate', { from: socket.id, candidate })
        }
    })

    // Transfer consent flow relays
    socket.on('transfer-request', ({ roomId, info, passwordHash }) => {
        const targetRoom = roomId || socket.data.roomId
        if (!targetRoom) return
        const room = transferRooms.get(targetRoom)
        // If room requires password, validate before relaying request
        if (room && room.passwordHash && room.passwordHash !== passwordHash) {
            socket.emit('transfer-error', { reason: 'Incorrect password. Please try again.', requiresPassword: true })
            return
        }
        const enriched = {
            ...info,
            ip: (socket.handshake && (socket.handshake.address || socket.handshake.headers['x-forwarded-for'])) || info?.ip,
            userAgent: (socket.handshake && socket.handshake.headers['user-agent']) || info?.userAgent,
        }
        socket.to(targetRoom).emit('transfer-request', { from: socket.id, info: enriched })
    })

    // Sender can set or clear a password for the room at any time
    socket.on('set-room-password', ({ roomId, passwordHash }) => {
        const targetRoom = roomId || socket.data.roomId
        if (!targetRoom) return
        const room = transferRooms.get(targetRoom)
        if (!room) return
        if (room.sender !== socket.id) return // only sender allowed
        room.passwordHash = passwordHash || null
    })

    socket.on('transfer-accepted', ({ roomId }) => {
        const targetRoom = roomId || socket.data.roomId
        if (targetRoom) {
            const room = transferRooms.get(targetRoom)
            if (room) room.approved = true
            socket.to(targetRoom).emit('transfer-accepted', { from: socket.id })
        }
    })

    socket.on('transfer-declined', ({ roomId, reason }) => {
        const targetRoom = roomId || socket.data.roomId
        if (targetRoom) {
            socket.to(targetRoom).emit('transfer-declined', { from: socket.id, reason })
        }
    })

    // Transfer canceled (fallback when DataChannel isn't open yet)
    // Relay who canceled so the peer can update UI accordingly
    socket.on('transfer-canceled', ({ roomId, by }) => {
        const targetRoom = roomId || socket.data.roomId
        if (!targetRoom) return
        socket.to(targetRoom).emit('transfer-canceled', { from: socket.id, by: by || socket.data.role || 'unknown' })
    })

    // Handle chat messages
    socket.on('chat-message', async ({ from, to, text }) => {
        // Encrypt message before storing in database
        const encryptedText = encrypt(text);

        // Save encrypted message to database
        try {
            await Message.create({
                from,
                to,
                text: encryptedText
            });
        } catch (err) {
            console.error('Error saving message:', err);
        }

        // Send DECRYPTED message to recipient if online (server-side decryption)
        // This keeps messages encrypted at rest but readable in transit over HTTPS
        if (onlineUsers.has(to)) {
            const recipientSockets = onlineUsers.get(to);
            recipientSockets.forEach(socketId => {
                io.to(socketId).emit('chat-message', { from, to, text: text }); // Send plaintext
            });
        }
    })

    // ========== NOTES REAL-TIME COLLABORATION ==========

    // User joins a note for editing
    socket.on('note:join', async ({ noteSlug, userId, username }) => {
        socket.join(`note:${noteSlug}`)
        socket.data.currentNote = noteSlug

        // Assign a color for this user's cursor
        const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2']
        const userColor = colors[Math.floor(Math.random() * colors.length)]

        // Broadcast that user joined
        io.to(`note:${noteSlug}`).emit('note:user-joined', {
            userId,
            username,
            socketId: socket.id,
            color: userColor,
            timestamp: Date.now()
        })

        console.log(`User ${username} (${userId}) joined note: ${noteSlug}`)
    })

    // Content update from user
    socket.on('note:content-update', async ({ noteSlug, content, userId }) => {
        // Broadcast to all other users in this note (not sender)
        socket.to(`note:${noteSlug}`).emit('note:content-changed', {
            content,
            userId,
            socketId: socket.id,
            timestamp: Date.now()
        })
    })

    // Cursor position update
    socket.on('note:cursor-update', ({ noteSlug, userId, position, selection }) => {
        socket.to(`note:${noteSlug}`).emit('note:cursor-moved', {
            userId,
            socketId: socket.id,
            position,
            selection,
            timestamp: Date.now()
        })
    })

    // User is typing indicator
    socket.on('note:typing', ({ noteSlug, userId, isTyping }) => {
        socket.to(`note:${noteSlug}`).emit('note:user-typing', {
            userId,
            socketId: socket.id,
            isTyping,
            timestamp: Date.now()
        })
    })

    // User leaves the note
    socket.on('note:leave', ({ noteSlug, userId }) => {
        socket.leave(`note:${noteSlug}`)
        socket.data.currentNote = null

        io.to(`note:${noteSlug}`).emit('note:user-left', {
            userId,
            socketId: socket.id,
            timestamp: Date.now()
        })

        console.log(`User ${userId} left note: ${noteSlug}`)
    })

    socket.on('disconnect', () => {
        const roomId = socket.data.roomId
        const role = socket.data.role
        const currentNote = socket.data.currentNote
        const userId = socket.data.userId

        // Clean up note collaboration if user was editing
        if (currentNote) {
            io.to(`note:${currentNote}`).emit('note:user-left', {
                userId,
                socketId: socket.id,
                timestamp: Date.now()
            })
        }

        if (roomId) {
            socket.to(roomId).emit('peer-left', { id: socket.id })

            // Clean up transfer room tracking
            const room = transferRooms.get(roomId)
            if (room) {
                if (role === 'sender' && room.sender === socket.id) {
                    // Sender disconnected - clear sender slot but keep room for reuse
                    // This allows the link to be used multiple times
                    room.sender = null
                    room.receiver = null
                    room.approved = false
                    // Note: Keep passwordHash so protection persists across reconnects
                } else if (role === 'receiver' && room.receiver === socket.id) {
                    // Receiver disconnected, clear receiver slot
                    room.receiver = null
                    room.approved = false
                }
            }
        }

        // Remove user from online list
        if (userId && onlineUsers.has(userId)) {
            onlineUsers.get(userId).delete(socket.id)
            if (onlineUsers.get(userId).size === 0) {
                onlineUsers.delete(userId)
                io.emit('user-status-changed', { userId, online: false })
            }
        }
    })
})

// Expose onlineUsers and io to routes via app.locals
app.locals.onlineUsers = onlineUsers
app.locals.io = io

const PORT = process.env.PORT || 4000

// Keep trying to establish MongoDB connection without crashing the app
function connectWithRetry() {
    if (!process.env.MONGO_URL) {
        console.warn('⚠ MongoDB URL not provided. Auth will not work.')
        return
    }
    mongoose.connect(process.env.MONGO_URL, {
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
    })
        .then(() => {
            dbConnected = true
            console.log('✓ Connected to MongoDB')
        })
        .catch((err) => {
            dbConnected = false
            console.error('MongoDB connection failed:', err?.message || err)
            console.log('↻ Retrying MongoDB connection in 5s...')
            setTimeout(connectWithRetry, 5000)
        })
}

mongoose.connection.on('disconnected', () => {
    dbConnected = false
    console.warn('⚠ MongoDB disconnected')
})
mongoose.connection.on('reconnected', () => {
    dbConnected = true
    console.log('✓ MongoDB reconnected')
})

async function start() {
    // Begin (or skip) DB connection attempts without blocking server start
    connectWithRetry()

    server.listen(PORT, () => {
        console.log(`✓ Server listening on port ${PORT}`)
        const originsShown = (ORIGIN_LIST.length ? ORIGIN_LIST : DEFAULT_ORIGINS).join(', ')
        console.log(`  - Allowed Origins: ${originsShown}`)
        console.log(`  - API (example local): http://localhost:${PORT}/api`)
        console.log(`  - Socket.IO (example local): ws://localhost:${PORT}`)
    })
}

start()
