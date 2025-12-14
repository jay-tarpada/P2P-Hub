const jwt = require('jsonwebtoken')

const JWT_SECRET = process.env.JWT_SECRET

// Fail fast if JWT_SECRET is not set in production
if (process.env.NODE_ENV === 'production' && !JWT_SECRET) {
    throw new Error('FATAL: JWT_SECRET must be set in production environment')
}

// Use fallback only in development
const SECRET = JWT_SECRET || 'dev-secret-INSECURE-change-in-production'

if (!JWT_SECRET && process.env.NODE_ENV !== 'production') {
    console.warn('⚠️  WARNING: Using default JWT_SECRET in development. Set JWT_SECRET in .env for security.')
}

function signToken(payload, options = {}) {
    return jwt.sign(payload, SECRET, { expiresIn: '7d', ...options })
}

function verifyToken(token) {
    try {
        return jwt.verify(token, SECRET)
    } catch (error) {
        return null
    }
}

function authMiddleware(req, res, next) {
    const token = req.cookies.token

    if (!token) {
        return res.status(401).json({ error: 'Not authenticated' })
    }

    const decoded = verifyToken(token)
    if (!decoded) {
        return res.status(401).json({ error: 'Invalid or expired token' })
    }

    req.userId = decoded.userId
    req.user = { userId: decoded.userId }
    next()
}

module.exports = { signToken, verifyToken, authMiddleware }
