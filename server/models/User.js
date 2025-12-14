const mongoose = require('mongoose')

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    username: {
        type: String,
        required: false,
        lowercase: true,
        trim: true,
        minlength: 3,
        maxlength: 20,
        match: [/^[a-z0-9_.-]+$/, 'Username may contain lowercase letters, numbers, underscores, dots and hyphens only']
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    password: {
        type: String,
        required: true
    },
    friends: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    createdAt: {
        type: Date,
        default: Date.now
    }
    ,
    isVerified: {
        type: Boolean,
        default: false
    },
    emailVerificationToken: {
        type: String
    },
    emailVerificationExpires: {
        type: Date
    },
    passwordResetToken: {
        type: String,
        default: null,
    },
    passwordResetExpires: {
        type: Date,
        default: null,
    },
    accountDeletionCode: {
        type: String,
        default: null,
    },
    accountDeletionExpires: {
        type: Date,
        default: null,
    },
    emailChangeCode: {
        type: String,
        default: null,
    },
    emailChangeExpires: {
        type: Date,
        default: null,
    },
    pendingEmail: {
        type: String,
        default: null,
    },
})

// Ensure unique username while allowing users without a username (sparse index)
userSchema.index({ username: 1 }, { unique: true, sparse: true })

module.exports = mongoose.model('User', userSchema)
