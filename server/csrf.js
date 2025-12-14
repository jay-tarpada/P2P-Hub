// CSRF protection middleware setup
const csurf = require('csurf')
const cookieParser = require('cookie-parser')

// Use cookie-based CSRF tokens
const csrfProtection = csurf({ cookie: true })

module.exports = csrfProtection
