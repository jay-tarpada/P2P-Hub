// Session timeout middleware for Express
const jwt = require('jsonwebtoken')
const SECRET = process.env.JWT_SECRET
const SESSION_TIMEOUT_MINUTES = parseInt(process.env.SESSION_TIMEOUT_MINUTES || '30', 10)

function sessionTimeoutMiddleware(req, res, next) {
    const token = req.cookies.token
    if (!token) return next()
    try {
        const decoded = jwt.verify(token, SECRET)
        const lastActivity = decoded.lastActivity || decoded.iat * 1000
        const now = Date.now()
        const timeoutMs = SESSION_TIMEOUT_MINUTES * 60 * 1000
        if (now - lastActivity > timeoutMs) {
            res.clearCookie('token')
            return res.status(440).json({ error: 'Session expired due to inactivity' })
        }
        // Update lastActivity in token (sliding window)
        req.lastActivity = now
        req.userId = decoded.userId
        next()
    } catch (err) {
        return res.status(401).json({ error: 'Invalid or expired session' })
    }
}

module.exports = sessionTimeoutMiddleware
