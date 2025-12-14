const jwt = require('jsonwebtoken')
const SECRET = process.env.JWT_SECRET
const REFRESH_SECRET = process.env.REFRESH_TOKEN_SECRET || (SECRET + '_refresh')

// Generate access token (short-lived)
function generateAccessToken(payload) {
    return jwt.sign(payload, SECRET, { expiresIn: '15m' })
}

// Generate refresh token (long-lived)
function generateRefreshToken(payload) {
    return jwt.sign(payload, REFRESH_SECRET, { expiresIn: '7d' })
}

// Verify access token
function verifyAccessToken(token) {
    try {
        return jwt.verify(token, SECRET)
    } catch (err) {
        return null
    }
}

// Verify refresh token
function verifyRefreshToken(token) {
    try {
        return jwt.verify(token, REFRESH_SECRET)
    } catch (err) {
        return null
    }
}

module.exports = {
    generateAccessToken,
    generateRefreshToken,
    verifyAccessToken,
    verifyRefreshToken
}
