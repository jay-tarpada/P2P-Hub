const express = require('express')
const bcrypt = require('bcrypt')
const rateLimit = require('express-rate-limit')
const validator = require('validator')
const User = require('../models/User')
const FriendRequest = require('../models/FriendRequest')
const Message = require('../models/Message')
const { signToken, authMiddleware } = require('../utils/jwt')
const {
    generateAccessToken,
    generateRefreshToken,
    verifyAccessToken,
    verifyRefreshToken
} = require('../refreshToken')

const router = express.Router()

// Audit logging helper
function auditLog(action, userId, details = {}) {
    const timestamp = new Date().toISOString()
    const logEntry = {
        timestamp,
        action,
        userId: userId || 'anonymous',
        ...details,
        ip: details.ip || 'unknown'
    }
    console.log('[AUDIT]', JSON.stringify(logEntry))
    // In production, send to logging service (e.g., Winston, Elasticsearch, CloudWatch)
}

// Input sanitization helpers
function sanitizeString(input) {
    if (typeof input !== 'string') return ''
    // Remove any HTML/script tags and trim whitespace
    return validator.escape(validator.trim(input))
}

function sanitizeUsername(username) {
    if (typeof username !== 'string') return ''
    const cleaned = validator.trim(username.toLowerCase())
    // Only allow alphanumeric and underscore (stricter validation)
    if (!/^[a-z0-9_]+$/.test(cleaned)) return ''
    return cleaned
}

function sanitizeEmail(email) {
    if (typeof email !== 'string') return ''
    const cleaned = validator.trim(email.toLowerCase())
    return validator.isEmail(cleaned) ? validator.normalizeEmail(cleaned) : ''
}

// Rate limiters
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 requests per window
    message: { error: 'Too many attempts, please try again later' },
    standardHeaders: true,
    legacyHeaders: false,
})

const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 requests per window
    message: { error: 'Too many requests, please slow down' },
    standardHeaders: true,
    legacyHeaders: false,
})

// Password validation helper
function validatePassword(password) {
    if (!password || password.length < 8) {
        return { valid: false, error: 'Password must be at least 8 characters long' }
    }
    if (!/[a-z]/.test(password)) {
        return { valid: false, error: 'Password must contain at least one lowercase letter' }
    }
    if (!/[A-Z]/.test(password)) {
        return { valid: false, error: 'Password must contain at least one uppercase letter' }
    }
    if (!/[0-9]/.test(password)) {
        return { valid: false, error: 'Password must contain at least one number' }
    }
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
        return { valid: false, error: 'Password must contain at least one special character (!@#$%^&*(),.?":{}|<>)' }
    }
    return { valid: true }
}

// Username validation (stricter - alphanumeric + underscore only)
function validateUsername(username) {
    const uname = sanitizeUsername(username)
    if (uname.length < 3 || uname.length > 20) {
        return { valid: false, error: 'Username must be 3-20 characters long' }
    }
    if (!/^[a-z0-9_]+$/.test(uname)) {
        return { valid: false, error: 'Username can only contain letters, numbers, and underscores' }
    }
    return { valid: true, username: uname }
}

// Cookie configuration (env-driven)
const isProd = process.env.NODE_ENV === 'production'
const COOKIE_SAMESITE = (process.env.COOKIE_SAMESITE || 'lax').toLowerCase() // 'lax' | 'none' | 'strict'
const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN || undefined
const SESSION_ONLY = String(process.env.COOKIE_SESSION_ONLY || '').toLowerCase() === 'true'
function buildCookieOptions() {
    const opts = {
        httpOnly: true,
        secure: isProd,
        sameSite: COOKIE_SAMESITE,
        path: '/',
    }
    if (COOKIE_DOMAIN) opts.domain = COOKIE_DOMAIN
    if (!SESSION_ONLY) {
        opts.maxAge = 7 * 24 * 60 * 60 * 1000 // 7 days
    }
    return opts
}

// Register
router.post('/register', authLimiter, async (req, res) => {
    const clientIp = req.ip || req.connection.remoteAddress
    try {
        const { name, username, email, password } = req.body

        // Sanitize inputs
        const sanitizedName = sanitizeString(name)
        const sanitizedEmail = sanitizeEmail(email)

        // Validation
        if (!sanitizedName || !sanitizedEmail || !password || !username) {
            auditLog('register_failed', null, { reason: 'missing_fields', ip: clientIp })
            return res.status(400).json({ error: 'Name, username, email, and password are required' })
        }

        // Validate email format
        if (!sanitizedEmail) {
            auditLog('register_failed', null, { reason: 'invalid_email', ip: clientIp })
            return res.status(400).json({ error: 'Invalid email format' })
        }

        // Validate username
        const usernameCheck = validateUsername(username)
        if (!usernameCheck.valid) {
            auditLog('register_failed', null, { reason: 'invalid_username', ip: clientIp })
            return res.status(400).json({ error: usernameCheck.error })
        }
        const sanitizedUsername = usernameCheck.username

        // Validate password strength
        const passwordCheck = validatePassword(password)
        if (!passwordCheck.valid) {
            auditLog('register_failed', null, { reason: 'weak_password', ip: clientIp })
            return res.status(400).json({ error: passwordCheck.error })
        }

        // Check if user already exists (use sanitized email for lookup)
        const existingUser = await User.findOne({ email: sanitizedEmail })
        if (existingUser) {
            auditLog('register_failed', null, { reason: 'email_exists', email: sanitizedEmail, ip: clientIp })
            return res.status(409).json({ error: 'Email already registered' })
        }

        // Check username uniqueness
        const existingUsername = await User.findOne({ username: sanitizedUsername })
        if (existingUsername) {
            auditLog('register_failed', null, { reason: 'username_exists', username: sanitizedUsername, ip: clientIp })
            return res.status(409).json({ error: 'Username already taken' })
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10)

        // Generate email verification token
        const crypto = require('crypto')
        const verificationToken = crypto.randomBytes(32).toString('hex')
        const verificationExpires = Date.now() + 24 * 60 * 60 * 1000 // 24 hours

        // Create user with verification fields
        const user = await User.create({
            name: sanitizedName,
            username: sanitizedUsername,
            email: sanitizedEmail,
            password: hashedPassword,
            isVerified: false,
            emailVerificationToken: verificationToken,
            emailVerificationExpires: verificationExpires
        })

        // Send verification email
        const { sendMail } = require('../utils/mailer')
        const verifyUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/verify-email/${verificationToken}`
        await sendMail({
            to: sanitizedEmail,
            subject: 'Verify your email for P2P Hub',
            html: `<h2>Welcome to P2P Hub!</h2><p>Please verify your email by clicking the link below:</p><a href="${verifyUrl}">${verifyUrl}</a><p>This link will expire in 24 hours.</p>`
        })

        // Audit log successful registration
        auditLog('register_success', user._id.toString(), { username: sanitizedUsername, email: sanitizedEmail, ip: clientIp })

        res.status(201).json({
            message: 'Registration successful! Please check your email to verify your account.',
            user: {
                id: user._id,
                name: user.name,
                username: user.username,
                email: user.email,
                isVerified: user.isVerified
            }
        })
    } catch (error) {
        console.error('Register error:', error)
        auditLog('register_error', null, { error: error.message, ip: clientIp })
        res.status(500).json({ error: 'Server error during registration' })
    }
})

// Login with refresh token support
router.post('/login', authLimiter, async (req, res) => {
    const clientIp = req.ip || req.connection.remoteAddress
    try {
        const { email, password } = req.body
        const sanitizedEmail = sanitizeEmail(email)
        if (!sanitizedEmail || !password) {
            auditLog('login_failed', null, { reason: 'missing_credentials', ip: clientIp })
            return res.status(400).json({ error: 'Email and password are required' })
        }
        const user = await User.findOne({ email: sanitizedEmail })
        if (!user) {
            auditLog('login_failed', null, { reason: 'invalid_credentials', email: sanitizedEmail, ip: clientIp })
            return res.status(401).json({ error: 'Invalid credentials' })
        }
        const isValidPassword = await bcrypt.compare(password, user.password)
        if (!isValidPassword) {
            auditLog('login_failed', user._id.toString(), { reason: 'invalid_password', email: sanitizedEmail, ip: clientIp })
            return res.status(401).json({ error: 'Invalid credentials' })
        }

        // Check if email is verified
        if (!user.isVerified) {
            auditLog('login_failed', user._id.toString(), { reason: 'email_not_verified', email: sanitizedEmail, ip: clientIp })
            return res.status(403).json({ error: 'Please verify your email before logging in. Check your inbox for the verification link.' })
        }

        // Generate access and refresh tokens
        const accessToken = generateAccessToken({ userId: user._id, lastActivity: Date.now() })
        const refreshToken = generateRefreshToken({ userId: user._id })
        // Set cookies
        res.cookie('token', accessToken, buildCookieOptions())
        res.cookie('refreshToken', refreshToken, { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 })
        auditLog('login_success', user._id.toString(), { email: sanitizedEmail, ip: clientIp })
        res.json({
            user: {
                id: user._id,
                name: user.name,
                username: user.username,
                email: user.email
            }
        })
    } catch (error) {
        console.error('Login error:', error)
        auditLog('login_error', null, { error: error.message, ip: clientIp })
        res.status(500).json({ error: 'Server error during login' })
    }
})

// Refresh access token endpoint
router.post('/refresh-token', async (req, res) => {
    const refreshToken = req.cookies.refreshToken
    if (!refreshToken) return res.status(401).json({ error: 'No refresh token provided' })
    const payload = verifyRefreshToken(refreshToken)
    if (!payload || !payload.userId) return res.status(401).json({ error: 'Invalid refresh token' })
    // Issue new access token
    const accessToken = generateAccessToken({ userId: payload.userId, lastActivity: Date.now() })
    res.cookie('token', accessToken, buildCookieOptions())
    res.json({ success: true })
})

// Get current user (restore session)
router.get('/me', authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.userId).select('-password')
        if (!user) {
            return res.status(404).json({ error: 'User not found' })
        }

        res.json({
            user: {
                id: user._id,
                name: user.name,
                username: user.username,
                email: user.email
            }
        })
    } catch (error) {
        console.error('Get user error:', error)
        res.status(500).json({ error: 'Server error' })
    }
})

// Check username availability
router.get('/check-username', generalLimiter, async (req, res) => {
    const clientIp = req.ip || req.connection.remoteAddress
    try {
        const rawUsername = String(req.query.username || '').trim()
        if (!rawUsername) {
            auditLog('check_username_failed', null, { reason: 'missing_username', ip: clientIp })
            return res.status(400).json({ error: 'Username is required' })
        }

        // Use stricter validation
        const usernameCheck = validateUsername(rawUsername)
        if (!usernameCheck.valid) {
            auditLog('check_username_failed', null, { reason: 'invalid_format', username: rawUsername, ip: clientIp })
            return res.status(400).json({ error: usernameCheck.error })
        }

        const sanitizedUsername = usernameCheck.username
        const exists = await User.exists({ username: sanitizedUsername })

        auditLog('check_username_success', null, { username: sanitizedUsername, available: !exists, ip: clientIp })
        return res.json({ available: !exists })
    } catch (error) {
        console.error('Check username error:', error)
        auditLog('check_username_error', null, { error: error.message, ip: clientIp })
        res.status(500).json({ error: 'Server error' })
    }
})

// Search users by username
router.get('/search', authMiddleware, generalLimiter, async (req, res) => {
    const clientIp = req.ip || req.connection.remoteAddress
    try {
        // Sanitize search query
        const rawQuery = String(req.query.q || '').trim()
        if (!rawQuery) return res.json({ users: [] })
        if (rawQuery.length < 2) {
            auditLog('search_failed', req.user.userId, { reason: 'query_too_short', ip: clientIp })
            return res.status(400).json({ error: 'Search query must be at least 2 characters' })
        }

        // Escape regex special characters to prevent ReDoS attacks
        const sanitizedQuery = validator.escape(rawQuery).toLowerCase()
        const escapedQuery = sanitizedQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

        const currentUserId = req.user.userId

        // Use escaped query for safe regex search
        const users = await User.find({
            _id: { $ne: currentUserId }, // Exclude current user
            $or: [
                { username: { $regex: escapedQuery, $options: 'i' } },
                { name: { $regex: escapedQuery, $options: 'i' } }
            ]
        })
            .select('_id name username email friends')
            .limit(10)

        // Get online status from Socket.IO onlineUsers Map
        const onlineUsers = req.app.locals.onlineUsers || new Map()

        // Get all friend requests involving current user
        const friendRequests = await FriendRequest.find({
            $or: [
                { sender: currentUserId },
                { receiver: currentUserId }
            ],
            status: 'pending'
        })

        const sentRequests = new Set(
            friendRequests
                .filter(fr => fr.sender.toString() === currentUserId)
                .map(fr => fr.receiver.toString())
        )

        const receivedRequests = new Set(
            friendRequests
                .filter(fr => fr.receiver.toString() === currentUserId)
                .map(fr => fr.sender.toString())
        )

        // Audit log successful search
        auditLog('search_success', currentUserId, { query: rawQuery, resultsCount: users.length, ip: clientIp })

        return res.json({
            users: users.map(u => {
                const userId = u._id.toString()
                const isFriend = u.friends.some(fId => fId.toString() === currentUserId)
                const requestSent = sentRequests.has(userId)
                const requestReceived = receivedRequests.has(userId)

                let friendStatus = 'none'
                if (isFriend) friendStatus = 'friends'
                else if (requestSent) friendStatus = 'request_sent'
                else if (requestReceived) friendStatus = 'request_received'

                return {
                    id: u._id,
                    name: u.name,
                    username: u.username,
                    email: u.email,
                    online: onlineUsers.has(userId),
                    friendStatus
                }
            })
        })
    } catch (error) {
        console.error('Search users error:', error)
        auditLog('search_error', req.user.userId, { error: error.message, ip: clientIp })
        res.status(500).json({ error: 'Server error' })
    }
})

// Logout
router.post('/logout', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.userId;

        // Delete all messages for this user
        await Message.deleteMany({
            $or: [
                { from: userId },
                { to: userId }
            ]
        });

        // Clear cookie with matching options so browsers reliably remove it
        const clearOpts = buildCookieOptions()
        delete clearOpts.maxAge
        res.clearCookie('token', clearOpts);
        res.clearCookie('refreshToken', clearOpts);
        res.json({ message: 'Logged out successfully' });
    } catch (error) {
        console.error('Logout error:', error);
        const clearOpts2 = buildCookieOptions()
        delete clearOpts2.maxAge
        res.clearCookie('token', clearOpts2);
        res.clearCookie('refreshToken', clearOpts2);
        res.json({ message: 'Logged out successfully' });
    }
})

// Update current user profile
router.patch('/me', authMiddleware, async (req, res) => {
    const clientIp = req.ip || req.connection.remoteAddress
    try {
        const userId = req.userId
        const { name, username, email, password: currentPassword, newPassword } = req.body

        // Load user
        const user = await User.findById(userId)
        if (!user) {
            auditLog('profile_update_failed', userId, { reason: 'user_not_found', ip: clientIp })
            return res.status(404).json({ error: 'User not found' })
        }

        // Prepare updates with sanitization
        const updates = {}

        // Sanitize and update name
        if (typeof name === 'string' && name.trim()) {
            const sanitizedName = sanitizeString(name)
            if (sanitizedName) {
                updates.name = sanitizedName
            }
        }

        // Sanitize and update email
        if (typeof email === 'string' && email.trim()) {
            const sanitizedEmail = sanitizeEmail(email)
            if (!sanitizedEmail) {
                auditLog('profile_update_failed', userId, { reason: 'invalid_email', ip: clientIp })
                return res.status(400).json({ error: 'Invalid email format' })
            }

            // Check uniqueness if changing
            if (sanitizedEmail !== user.email) {
                const existing = await User.findOne({ email: sanitizedEmail })
                if (existing && String(existing._id) !== String(userId)) {
                    auditLog('profile_update_failed', userId, { reason: 'email_exists', email: sanitizedEmail, ip: clientIp })
                    return res.status(409).json({ error: 'Email already registered' })
                }
            }
            updates.email = sanitizedEmail
        }

        // Sanitize and update username
        if (typeof username === 'string' && username.trim()) {
            const usernameCheck = validateUsername(username)
            if (!usernameCheck.valid) {
                auditLog('profile_update_failed', userId, { reason: 'invalid_username', ip: clientIp })
                return res.status(400).json({ error: usernameCheck.error })
            }

            const sanitizedUsername = usernameCheck.username
            if (sanitizedUsername !== user.username) {
                const exists = await User.findOne({ username: sanitizedUsername })
                if (exists && String(exists._id) !== String(userId)) {
                    auditLog('profile_update_failed', userId, { reason: 'username_exists', username: sanitizedUsername, ip: clientIp })
                    return res.status(409).json({ error: 'Username already taken' })
                }
            }
            updates.username = sanitizedUsername
        }

        // Handle password change if requested
        if (newPassword) {
            if (!currentPassword) {
                auditLog('profile_update_failed', userId, { reason: 'missing_current_password', ip: clientIp })
                return res.status(400).json({ error: 'Current password is required to set a new password' })
            }

            // Validate new password strength
            const passwordCheck = validatePassword(newPassword)
            if (!passwordCheck.valid) {
                auditLog('profile_update_failed', userId, { reason: 'weak_new_password', ip: clientIp })
                return res.status(400).json({ error: passwordCheck.error })
            }

            const isValidPassword = await bcrypt.compare(currentPassword, user.password)
            if (!isValidPassword) {
                auditLog('profile_update_failed', userId, { reason: 'incorrect_current_password', ip: clientIp })
                return res.status(401).json({ error: 'Current password is incorrect' })
            }
            updates.password = await bcrypt.hash(newPassword, 10)
        }

        // Apply updates
        if (Object.keys(updates).length === 0) {
            auditLog('profile_update_failed', userId, { reason: 'no_changes', ip: clientIp })
            return res.status(400).json({ error: 'No changes provided' })
        }

        Object.assign(user, updates)
        await user.save()

        // Audit log successful profile update
        const changedFields = Object.keys(updates).filter(k => k !== 'password')
        if (updates.password) changedFields.push('password')
        auditLog('profile_update_success', userId, { fields: changedFields, ip: clientIp })

        return res.json({
            user: {
                id: user._id,
                name: user.name,
                username: user.username,
                email: user.email
            }
        })
    } catch (error) {
        console.error('Update profile error:', error)
        auditLog('profile_update_error', req.userId, { error: error.message, ip: clientIp })
        return res.status(500).json({ error: 'Server error updating profile' })
    }
})

// Send friend request
router.post('/friend-request/send', authMiddleware, generalLimiter, async (req, res) => {
    try {
        const senderId = req.user.userId
        const { receiverId } = req.body

        if (!receiverId) {
            return res.status(400).json({ error: 'Receiver ID is required' })
        }

        if (senderId === receiverId) {
            return res.status(400).json({ error: 'Cannot send friend request to yourself' })
        }

        // Check if receiver exists
        const receiver = await User.findById(receiverId)
        if (!receiver) {
            return res.status(404).json({ error: 'User not found' })
        }

        // Check if already friends
        const sender = await User.findById(senderId).select('_id name username email friends')
        if (sender.friends.includes(receiverId)) {
            return res.status(400).json({ error: 'Already friends' })
        }

        // Check if request already exists
        const existingRequest = await FriendRequest.findOne({
            $or: [
                { sender: senderId, receiver: receiverId },
                { sender: receiverId, receiver: senderId }
            ]
        })

        let friendRequest

        if (existingRequest) {
            if (existingRequest.status === 'pending') {
                return res.status(400).json({ error: 'Friend request already pending' })
            }
            // Update existing rejected request
            existingRequest.sender = senderId
            existingRequest.receiver = receiverId
            existingRequest.status = 'pending'
            existingRequest.createdAt = new Date()
            await existingRequest.save()
            friendRequest = existingRequest
        } else {
            // Create new friend request
            friendRequest = await FriendRequest.create({
                sender: senderId,
                receiver: receiverId,
                status: 'pending'
            })
        }

        // Get online status
        const onlineUsers = req.app.locals.onlineUsers || new Map()
        const io = req.app.locals.io

        // Prepare request data for the receiver
        const requestData = {
            id: friendRequest._id,
            sender: {
                id: sender._id,
                name: sender.name,
                username: sender.username,
                email: sender.email,
                online: onlineUsers.has(sender._id.toString())
            },
            createdAt: friendRequest.createdAt
        }

        // Emit Socket.IO event to the receiver
        if (io) {
            io.emit('friend-request-received', {
                userId: receiverId,
                request: requestData
            })

            // Also emit to sender to update their sent requests list
            const receiverData = {
                id: friendRequest._id,
                receiver: {
                    id: receiver._id,
                    name: receiver.name,
                    username: receiver.username,
                    email: receiver.email,
                    online: onlineUsers.has(receiver._id.toString())
                },
                createdAt: friendRequest.createdAt
            }

            io.emit('friend-request-sent', {
                userId: senderId,
                request: receiverData
            })
        }

        return res.json({ message: 'Friend request sent' })
    } catch (error) {
        console.error('Send friend request error:', error)
        return res.status(500).json({ error: 'Server error' })
    }
})

// Get pending friend requests (received)
router.get('/friend-request/pending', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.userId

        const requests = await FriendRequest.find({
            receiver: userId,
            status: 'pending'
        })
            .populate('sender', '_id name username email')
            .sort({ createdAt: -1 })

        // Get online status
        const onlineUsers = req.app.locals.onlineUsers || new Map()

        return res.json({
            requests: requests.map(r => ({
                id: r._id,
                sender: {
                    id: r.sender._id,
                    name: r.sender.name,
                    username: r.sender.username,
                    email: r.sender.email,
                    online: onlineUsers.has(r.sender._id.toString())
                },
                createdAt: r.createdAt
            }))
        })
    } catch (error) {
        console.error('Get pending requests error:', error)
        return res.status(500).json({ error: 'Server error' })
    }
})

// Get sent friend requests
router.get('/friend-request/sent', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.userId

        const requests = await FriendRequest.find({
            sender: userId,
            status: 'pending'
        })
            .populate('receiver', '_id name username email')
            .sort({ createdAt: -1 })

        // Get online status
        const onlineUsers = req.app.locals.onlineUsers || new Map()

        return res.json({
            requests: requests.map(r => ({
                id: r._id,
                receiver: {
                    id: r.receiver._id,
                    name: r.receiver.name,
                    username: r.receiver.username,
                    email: r.receiver.email,
                    online: onlineUsers.has(r.receiver._id.toString())
                },
                createdAt: r.createdAt
            }))
        })
    } catch (error) {
        console.error('Get sent requests error:', error)
        return res.status(500).json({ error: 'Server error' })
    }
})

// Cancel sent friend request
router.post('/friend-request/cancel', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.userId
        const { requestId } = req.body

        if (!requestId) {
            return res.status(400).json({ error: 'Request ID is required' })
        }

        const request = await FriendRequest.findById(requestId)
        if (!request) {
            return res.status(404).json({ error: 'Friend request not found' })
        }

        if (request.sender.toString() !== userId) {
            return res.status(403).json({ error: 'Unauthorized' })
        }

        if (request.status !== 'pending') {
            return res.status(400).json({ error: 'Request already processed' })
        }

        // Delete the request
        await FriendRequest.findByIdAndDelete(requestId)

        // Emit Socket.IO event to notify receiver that request was cancelled
        const io = req.app.locals.io
        if (io) {
            io.emit('friend-request-cancelled', {
                userId: request.receiver.toString(),
                requestId: requestId
            })
        }

        return res.json({ message: 'Friend request cancelled' })
    } catch (error) {
        console.error('Cancel friend request error:', error)
        return res.status(500).json({ error: 'Server error' })
    }
})

// Accept friend request
router.post('/friend-request/accept', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.userId
        const { requestId } = req.body

        if (!requestId) {
            return res.status(400).json({ error: 'Request ID is required' })
        }

        const request = await FriendRequest.findById(requestId)
            .populate('sender', '_id name username email')
            .populate('receiver', '_id name username email')

        if (!request) {
            return res.status(404).json({ error: 'Friend request not found' })
        }

        if (request.receiver._id.toString() !== userId) {
            return res.status(403).json({ error: 'Unauthorized' })
        }

        if (request.status !== 'pending') {
            return res.status(400).json({ error: 'Request already processed' })
        }

        // Update request status
        request.status = 'accepted'
        await request.save()

        // Add to friends list for both users
        await User.findByIdAndUpdate(request.sender._id, {
            $addToSet: { friends: request.receiver._id }
        })

        await User.findByIdAndUpdate(request.receiver._id, {
            $addToSet: { friends: request.sender._id }
        })

        // Get online status
        const onlineUsers = req.app.locals.onlineUsers || new Map()
        const io = req.app.locals.io

        // Prepare friend data for both users
        const senderData = {
            id: request.sender._id,
            name: request.sender.name,
            username: request.sender.username,
            email: request.sender.email,
            online: onlineUsers.has(request.sender._id.toString())
        }

        const receiverData = {
            id: request.receiver._id,
            name: request.receiver.name,
            username: request.receiver.username,
            email: request.receiver.email,
            online: onlineUsers.has(request.receiver._id.toString())
        }

        // Emit Socket.IO event to both users
        if (io) {
            // Notify the sender (they gained a friend, and should remove from sent requests)
            io.emit('friend-added', {
                userId: request.sender._id.toString(),
                friendId: request.receiver._id.toString(),
                friend: receiverData
            })

            // Notify the receiver (they gained a friend, and should remove from pending requests)
            io.emit('friend-added', {
                userId: request.receiver._id.toString(),
                friendId: request.sender._id.toString(),
                friend: senderData
            })
        }

        return res.json({
            message: 'Friend request accepted',
            friend: senderData
        })
    } catch (error) {
        console.error('Accept friend request error:', error)
        return res.status(500).json({ error: 'Server error' })
    }
})

// Reject/Delete friend request
router.post('/friend-request/reject', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.userId
        const { requestId } = req.body

        if (!requestId) {
            return res.status(400).json({ error: 'Request ID is required' })
        }

        const request = await FriendRequest.findById(requestId)
        if (!request) {
            return res.status(404).json({ error: 'Friend request not found' })
        }

        if (request.receiver.toString() !== userId) {
            return res.status(403).json({ error: 'Unauthorized' })
        }

        // Delete the request
        await FriendRequest.findByIdAndDelete(requestId)

        // Emit Socket.IO event to notify sender that request was rejected (cancelled)
        const io = req.app.locals.io
        if (io) {
            io.emit('friend-request-cancelled', {
                userId: request.sender.toString(),
                requestId: requestId
            })
        }

        return res.json({ message: 'Friend request rejected' })
    } catch (error) {
        console.error('Reject friend request error:', error)
        return res.status(500).json({ error: 'Server error' })
    }
})

// Get user's friends list
router.get('/friends', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.userId

        const user = await User.findById(userId)
            .populate('friends', '_id name username email')

        if (!user) {
            return res.status(404).json({ error: 'User not found' })
        }

        // Get online status
        const onlineUsers = req.app.locals.onlineUsers || new Map()

        return res.json({
            friends: user.friends.map(friend => ({
                id: friend._id,
                name: friend.name,
                username: friend.username,
                email: friend.email,
                online: onlineUsers.has(friend._id.toString())
            }))
        })
    } catch (error) {
        console.error('Get friends error:', error)
        return res.status(500).json({ error: 'Server error' })
    }
})

// Remove friend
router.post('/friend/remove', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.userId
        const { friendId } = req.body

        if (!friendId) {
            return res.status(400).json({ error: 'Friend ID is required' })
        }

        if (userId === friendId) {
            return res.status(400).json({ error: 'Cannot remove yourself' })
        }

        // Check if they are friends
        const user = await User.findById(userId)
        if (!user) {
            return res.status(404).json({ error: 'User not found' })
        }

        if (!user.friends.includes(friendId)) {
            return res.status(400).json({ error: 'Not friends with this user' })
        }

        // Remove from both users' friends lists
        await User.findByIdAndUpdate(userId, {
            $pull: { friends: friendId }
        })

        await User.findByIdAndUpdate(friendId, {
            $pull: { friends: userId }
        })

        // Emit Socket.IO event to both users
        const io = req.app.locals.io
        if (io) {
            // Notify the user who removed the friend
            io.emit('friend-removed', {
                userId: userId,
                friendId: friendId
            })

            // Notify the friend who was removed
            io.emit('friend-removed', {
                userId: friendId,
                friendId: userId
            })
        }

        return res.json({ message: 'Friend removed successfully' })
    } catch (error) {
        console.error('Remove friend error:', error)
        return res.status(500).json({ error: 'Server error' })
    }
})

// Email verification endpoint
router.get('/verify-email/:token', async (req, res) => {
    const { token } = req.params;

    if (!token) {
        return res.status(400).json({ error: 'Verification token is required.' });
    }

    try {
        console.log('Verifying email with token:', token);

        // First check if user exists with this token (not expired)
        let user = await User.findOne({
            emailVerificationToken: token,
            emailVerificationExpires: { $gt: Date.now() }
        });

        console.log('User found with valid token:', !!user);

        // If no user found with valid token, check if already verified
        if (!user) {
            const alreadyVerified = await User.findOne({
                emailVerificationToken: token
            });

            console.log('User found with token (any status):', !!alreadyVerified);

            if (alreadyVerified) {
                if (alreadyVerified.isVerified) {
                    console.log('User already verified:', alreadyVerified.email);
                    return res.json({ message: 'Email already verified! You can log in.' });
                } else {
                    console.log('Token expired for user:', alreadyVerified.email);
                    return res.status(400).json({ error: 'Verification token has expired. Please request a new verification email.' });
                }
            }

            console.log('No user found with token');
            return res.status(400).json({ error: 'Invalid verification token.' });
        }

        console.log('Verifying user:', user.email);
        user.isVerified = true;
        user.emailVerificationToken = undefined;
        user.emailVerificationExpires = undefined;
        await user.save();

        console.log('User verified successfully:', user.email);
        res.json({ message: 'Email verified successfully! You can now log in.' });
    } catch (err) {
        console.error('Verification error:', err);
        console.error('Error stack:', err.stack);
        res.status(500).json({
            error: 'Server error during verification.',
            details: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
});

// Resend verification email
router.post('/resend-verification', authLimiter, async (req, res) => {
    const { email } = req.body;
    const sanitizedEmail = sanitizeEmail(email);
    if (!sanitizedEmail) {
        return res.status(400).json({ error: 'Valid email required.' });
    }
    try {
        const user = await User.findOne({ email: sanitizedEmail });
        if (!user) {
            return res.status(404).json({ error: 'No account found with that email.' });
        }
        if (user.isVerified) {
            return res.status(400).json({ error: 'Email is already verified.' });
        }
        // Generate new token and expiry
        const crypto = require('crypto');
        user.emailVerificationToken = crypto.randomBytes(32).toString('hex');
        user.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000;
        await user.save();
        // Send verification email
        const { sendMail } = require('../utils/mailer');
        const verifyUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/verify-email/${user.emailVerificationToken}`;
        await sendMail({
            to: sanitizedEmail,
            subject: 'Verify your email for P2P Hub',
            html: `<h2>Verify your email</h2><p>Please verify your email by clicking the link below:</p><a href="${verifyUrl}">${verifyUrl}</a><p>This link will expire in 24 hours.</p><p>If you did not request this, you can ignore this email.</p>`
        });
        res.json({ message: 'Verification email resent. Please check your inbox.' });
    } catch (err) {
        console.error('Resend verification error:', err);
        res.status(500).json({ error: 'Server error during resend.' });
    }
});

// Request password reset
router.post('/forgot-password', authLimiter, async (req, res) => {
    const clientIp = req.ip || req.connection.remoteAddress;
    const { email } = req.body;
    const sanitizedEmail = sanitizeEmail(email);

    if (!sanitizedEmail) {
        auditLog('forgot_password_failed', null, { reason: 'invalid_email', ip: clientIp });
        return res.status(400).json({ error: 'Valid email required.' });
    }

    try {
        const user = await User.findOne({ email: sanitizedEmail });

        // Don't reveal if user exists or not (security best practice)
        if (!user) {
            auditLog('forgot_password_attempt', null, { email: sanitizedEmail, userExists: false, ip: clientIp });
            return res.json({ message: 'If an account exists with that email, a password reset link has been sent.' });
        }

        // Generate reset token
        const crypto = require('crypto');
        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');

        user.passwordResetToken = resetTokenHash;
        user.passwordResetExpires = Date.now() + 60 * 60 * 1000; // 1 hour
        await user.save();

        // Send reset email
        const { sendMail } = require('../utils/mailer');
        const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password/${resetToken}`;

        await sendMail({
            to: sanitizedEmail,
            subject: 'Password Reset Request - P2P Hub',
            html: `
                <h2>Password Reset Request</h2>
                <p>You requested a password reset for your P2P Hub account.</p>
                <p>Click the link below to reset your password:</p>
                <a href="${resetUrl}" style="display: inline-block; padding: 10px 20px; background-color: #7c3aed; color: white; text-decoration: none; border-radius: 5px;">Reset Password</a>
                <p>Or copy this link: ${resetUrl}</p>
                <p>This link will expire in 1 hour.</p>
                <p><strong>If you didn't request this, please ignore this email.</strong></p>
            `
        });

        auditLog('forgot_password_success', user._id.toString(), { email: sanitizedEmail, ip: clientIp });
        res.json({ message: 'If an account exists with that email, a password reset link has been sent.' });
    } catch (err) {
        console.error('Forgot password error:', err);
        auditLog('forgot_password_error', null, { error: err.message, ip: clientIp });
        res.status(500).json({ error: 'Server error during password reset request.' });
    }
});

// Reset password with token
router.post('/reset-password', authLimiter, async (req, res) => {
    const clientIp = req.ip || req.connection.remoteAddress;
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
        auditLog('reset_password_failed', null, { reason: 'missing_fields', ip: clientIp });
        return res.status(400).json({ error: 'Reset token and new password are required.' });
    }

    // Validate new password strength
    const passwordCheck = validatePassword(newPassword);
    if (!passwordCheck.valid) {
        auditLog('reset_password_failed', null, { reason: 'weak_password', ip: clientIp });
        return res.status(400).json({ error: passwordCheck.error });
    }

    try {
        // Hash the token to compare with stored hash
        const crypto = require('crypto');
        const resetTokenHash = crypto.createHash('sha256').update(token).digest('hex');

        const user = await User.findOne({
            passwordResetToken: resetTokenHash,
            passwordResetExpires: { $gt: Date.now() }
        });

        if (!user) {
            auditLog('reset_password_failed', null, { reason: 'invalid_or_expired_token', ip: clientIp });
            return res.status(400).json({ error: 'Invalid or expired reset token.' });
        }

        // Hash new password and update user
        user.password = await bcrypt.hash(newPassword, 10);
        user.passwordResetToken = undefined;
        user.passwordResetExpires = undefined;
        await user.save();

        // Send confirmation email
        const { sendMail } = require('../utils/mailer');
        await sendMail({
            to: user.email,
            subject: 'Password Changed - P2P Hub',
            html: `
                <h2>Password Successfully Changed</h2>
                <p>Your password for P2P Hub has been successfully changed.</p>
                <p>If you didn't make this change, please contact support immediately.</p>
            `
        });

        auditLog('reset_password_success', user._id.toString(), { email: user.email, ip: clientIp });
        res.json({ message: 'Password reset successful! You can now log in with your new password.' });
    } catch (err) {
        console.error('Reset password error:', err);
        auditLog('reset_password_error', null, { error: err.message, ip: clientIp });
        res.status(500).json({ error: 'Server error during password reset.' });
    }
});

// Request account deletion - send 6-digit code via email
router.post('/request-account-deletion', authLimiter, async (req, res) => {
    const clientIp = req.ip || req.connection.remoteAddress;
    const { email } = req.body;

    if (!email) {
        auditLog('account_deletion_request_failed', null, { reason: 'missing_email', ip: clientIp });
        return res.status(400).json({ error: 'Email is required.' });
    }

    const sanitizedEmail = validator.normalizeEmail(email.toLowerCase().trim());
    if (!validator.isEmail(sanitizedEmail)) {
        auditLog('account_deletion_request_failed', null, { reason: 'invalid_email', ip: clientIp });
        return res.status(400).json({ error: 'Invalid email format.' });
    }

    try {
        const user = await User.findOne({ email: sanitizedEmail });

        // Even if user doesn't exist, return success to prevent email enumeration
        if (!user) {
            auditLog('account_deletion_request_failed', null, { email: sanitizedEmail, reason: 'user_not_found', ip: clientIp });
            return res.json({ message: 'If an account exists with that email, a deletion code has been sent.' });
        }

        // Generate 6-digit code
        const deletionCode = Math.floor(100000 + Math.random() * 900000).toString();

        // Store hashed code
        const crypto = require('crypto');
        const codeHash = crypto.createHash('sha256').update(deletionCode).digest('hex');

        user.accountDeletionCode = codeHash;
        user.accountDeletionExpires = Date.now() + 15 * 60 * 1000; // 15 minutes
        await user.save();

        // Send deletion code via email
        const { sendMail } = require('../utils/mailer');
        await sendMail({
            to: user.email,
            subject: 'Account Deletion Code - P2P Hub',
            html: `
                <h2>Account Deletion Request</h2>
                <p>You requested to delete your account on P2P Hub.</p>
                <p><strong>Your verification code is: <span style="font-size: 24px; color: #d32f2f; font-weight: bold;">${deletionCode}</span></strong></p>
                <p>This code will expire in 15 minutes.</p>
                <p><strong>WARNING: This action cannot be undone. All your data will be permanently deleted.</strong></p>
                <p>If you didn't request this, please ignore this email and your account will remain active.</p>
            `
        });

        auditLog('account_deletion_request_success', user._id.toString(), { email: sanitizedEmail, ip: clientIp });
        res.json({ message: 'If an account exists with that email, a deletion code has been sent.' });
    } catch (err) {
        console.error('Account deletion request error:', err);
        auditLog('account_deletion_request_error', null, { error: err.message, ip: clientIp });
        res.status(500).json({ error: 'Server error during deletion request.' });
    }
});

// Verify deletion code and delete account
router.post('/delete-account', authLimiter, async (req, res) => {
    const clientIp = req.ip || req.connection.remoteAddress;
    const { email, code } = req.body;

    if (!email || !code) {
        auditLog('account_deletion_failed', null, { reason: 'missing_fields', ip: clientIp });
        return res.status(400).json({ error: 'Email and verification code are required.' });
    }

    const sanitizedEmail = validator.normalizeEmail(email.toLowerCase().trim());
    if (!validator.isEmail(sanitizedEmail)) {
        auditLog('account_deletion_failed', null, { reason: 'invalid_email', ip: clientIp });
        return res.status(400).json({ error: 'Invalid email format.' });
    }

    try {
        // Hash the code to compare
        const crypto = require('crypto');
        const codeHash = crypto.createHash('sha256').update(code.trim()).digest('hex');

        const user = await User.findOne({
            email: sanitizedEmail,
            accountDeletionCode: codeHash,
            accountDeletionExpires: { $gt: Date.now() }
        });

        if (!user) {
            auditLog('account_deletion_failed', null, { email: sanitizedEmail, reason: 'invalid_or_expired_code', ip: clientIp });
            return res.status(400).json({ error: 'Invalid or expired verification code.' });
        }

        const userId = user._id.toString();
        const userName = user.name;

        // Clean up data:
        // 1. Remove from other users' friends lists
        await User.updateMany(
            { friends: user._id },
            { $pull: { friends: user._id } }
        );

        // 2. Delete friend requests
        const FriendRequest = require('../models/FriendRequest');
        await FriendRequest.deleteMany({
            $or: [{ sender: user._id }, { receiver: user._id }]
        });

        // 3. Delete messages
        const Message = require('../models/Message');
        await Message.deleteMany({
            $or: [{ sender: user._id }, { recipient: user._id }]
        });

        // 4. Delete the user account
        await User.findByIdAndDelete(user._id);

        // Send confirmation email
        const { sendMail } = require('../utils/mailer');
        await sendMail({
            to: user.email,
            subject: 'Account Deleted - P2P Hub',
            html: `
                <h2>Account Successfully Deleted</h2>
                <p>Your P2P Hub account (${userName}) has been permanently deleted.</p>
                <p>All your data, including friends, messages, and profile information, has been removed.</p>
                <p>Thank you for using P2P Hub. You're welcome back anytime!</p>
            `
        });

        auditLog('account_deletion_success', userId, { email: sanitizedEmail, name: userName, ip: clientIp });
        res.json({ message: 'Account successfully deleted.' });
    } catch (err) {
        console.error('Account deletion error:', err);
        auditLog('account_deletion_error', null, { error: err.message, ip: clientIp });
        res.status(500).json({ error: 'Server error during account deletion.' });
    }
});

// Request email change with verification code
router.post('/request-email-change', authMiddleware, async (req, res) => {
    const clientIp = req.ip || req.connection.remoteAddress;
    try {
        const userId = req.userId;
        const { newEmail } = req.body;

        if (!newEmail || typeof newEmail !== 'string') {
            return res.status(400).json({ error: 'New email is required.' });
        }

        const sanitizedEmail = sanitizeEmail(newEmail);
        if (!sanitizedEmail) {
            return res.status(400).json({ error: 'Invalid email format.' });
        }

        // Check if email is already in use
        const existingUser = await User.findOne({ email: sanitizedEmail });
        if (existingUser) {
            return res.status(409).json({ error: 'Email already registered.' });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found.' });
        }

        // Check if trying to change to same email
        if (user.email === sanitizedEmail) {
            return res.status(400).json({ error: 'New email is the same as current email.' });
        }

        // Generate 6-digit code
        const code = Math.floor(100000 + Math.random() * 900000).toString();

        // Save code and pending email (expires in 15 minutes)
        user.emailChangeCode = code;
        user.emailChangeExpires = new Date(Date.now() + 15 * 60 * 1000);
        user.pendingEmail = sanitizedEmail;
        await user.save();

        // Send verification email
        const { sendMail } = require('../utils/mailer');
        await sendMail({
            to: sanitizedEmail,
            subject: 'Verify Email Change - P2P Hub',
            html: `
                <h2>Email Change Verification</h2>
                <p>Hello ${user.name},</p>
                <p>You requested to change your email address to this email.</p>
                <p>Your verification code is:</p>
                <h1 style="font-size: 32px; letter-spacing: 5px; color: #A855F7;">${code}</h1>
                <p>This code will expire in 15 minutes.</p>
                <p>If you didn't request this change, please ignore this email.</p>
            `
        });

        auditLog('email_change_requested', userId, { newEmail: sanitizedEmail, ip: clientIp });
        res.json({ message: 'Verification code sent to new email address.' });
    } catch (err) {
        console.error('Email change request error:', err);
        auditLog('email_change_request_error', req.userId, { error: err.message, ip: clientIp });
        res.status(500).json({ error: 'Server error.' });
    }
});

// Verify email change code
router.post('/verify-email-change', authMiddleware, async (req, res) => {
    const clientIp = req.ip || req.connection.remoteAddress;
    try {
        const userId = req.userId;
        const { code } = req.body;

        if (!code || typeof code !== 'string') {
            return res.status(400).json({ error: 'Verification code is required.' });
        }

        const user = await User.findOne({
            _id: userId,
            emailChangeCode: code.trim(),
            emailChangeExpires: { $gt: Date.now() }
        });

        if (!user || !user.pendingEmail) {
            auditLog('email_change_failed', userId, { reason: 'invalid_or_expired_code', ip: clientIp });
            return res.status(400).json({ error: 'Invalid or expired verification code.' });
        }

        const oldEmail = user.email;
        const newEmail = user.pendingEmail;

        // Update email
        user.email = newEmail;
        user.emailChangeCode = null;
        user.emailChangeExpires = null;
        user.pendingEmail = null;
        await user.save();

        // Send confirmation to old email
        const { sendMail } = require('../utils/mailer');
        await sendMail({
            to: oldEmail,
            subject: 'Email Address Changed - P2P Hub',
            html: `
                <h2>Email Address Changed</h2>
                <p>Hello ${user.name},</p>
                <p>Your P2P Hub account email has been changed to: <strong>${newEmail}</strong></p>
                <p>If you didn't make this change, please contact support immediately.</p>
            `
        });

        auditLog('email_change_success', userId, { oldEmail, newEmail, ip: clientIp });
        res.json({
            message: 'Email successfully changed.',
            user: {
                id: user._id,
                name: user.name,
                username: user.username,
                email: user.email
            }
        });
    } catch (err) {
        console.error('Email change verification error:', err);
        auditLog('email_change_verification_error', req.userId, { error: err.message, ip: clientIp });
        res.status(500).json({ error: 'Server error.' });
    }
});

module.exports = router

