const mongoose = require('mongoose');

const noteSchema = new mongoose.Schema({
    slug: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true,
        minlength: 3,
        maxlength: 50,
        match: /^[a-z0-9-]+$/
    },
    title: {
        type: String,
        required: true,
        trim: true,
        maxlength: 200
    },
    content: {
        type: Object,
        default: {}
    },
    owner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    // Access Control
    isPublic: {
        type: Boolean,
        default: false
    },
    isPasswordProtected: {
        type: Boolean,
        default: false
    },
    passwordHash: {
        type: String,
        default: null
    },
    // Collaboration
    collaborators: [{
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        permission: {
            type: String,
            enum: ['view', 'edit'],
            default: 'view'
        },
        addedAt: {
            type: Date,
            default: Date.now
        }
    }],
    // Metadata
    lastEditedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    lastEditedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Index for faster queries
noteSchema.index({ owner: 1, createdAt: -1 });

// Pre-save middleware to update lastEditedAt
noteSchema.pre('save', function (next) {
    this.lastEditedAt = Date.now();
    next();
});

const Note = mongoose.model('Note', noteSchema);

module.exports = Note;
