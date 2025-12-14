const express = require('express');
const router = express.Router();
const Note = require('../models/Note');
const User = require('../models/User');
const bcrypt = require('bcrypt');
const { authMiddleware } = require('../utils/jwt');

// Temporary migration endpoint - make all notes public
router.post('/migrate-to-public', authMiddleware, async (req, res) => {
    try {
        const result = await Note.updateMany(
            { owner: req.userId || req.user.userId },
            { $set: { isPublic: true } }
        );
        res.json({ message: `Updated ${result.modifiedCount} notes to public`, result });
    } catch (error) {
        console.error('Migration error:', error);
        res.status(500).json({ error: 'Failed to migrate notes' });
    }
});

// Middleware to check if user is authenticated (but don't block public access)
const optionalAuth = (req, res, next) => {
    // Try to get token from cookies (like authMiddleware does)
    const token = req.cookies.token;

    if (token) {
        const { verifyToken } = require('../utils/jwt');
        const decoded = verifyToken(token);

        if (decoded) {
            req.userId = decoded.userId;
            req.user = { userId: decoded.userId };
            console.log('optionalAuth - authenticated user:', decoded.userId);
        }
    }
    next();
};

// Check if slug is available
router.post('/check-slug', async (req, res) => {
    try {
        const { slug } = req.body;

        if (!slug) {
            return res.status(400).json({ error: 'Slug is required' });
        }

        // Validate slug format
        if (!/^[a-z0-9-]+$/.test(slug)) {
            return res.status(400).json({ error: 'Slug can only contain lowercase letters, numbers, and hyphens' });
        }

        if (slug.length < 3 || slug.length > 50) {
            return res.status(400).json({ error: 'Slug must be between 3 and 50 characters' });
        }

        // Check for reserved slugs
        const reserved = ['new', 'edit', 'create', 'admin', 'api', 'settings'];
        if (reserved.includes(slug)) {
            return res.status(400).json({ error: 'This slug is reserved' });
        }

        const existing = await Note.findOne({ slug });
        res.json({ available: !existing });
    } catch (error) {
        console.error('Check slug error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Create new note (requires auth)
router.post('/', authMiddleware, async (req, res) => {
    try {
        console.log('Create note - req.user:', req.user);
        console.log('Create note - req.userId:', req.userId);

        const { slug, title, content, isPublic, isPasswordProtected, password } = req.body;

        // Validate required fields
        if (!slug || !title) {
            return res.status(400).json({ error: 'Slug and title are required' });
        }

        // Check if slug already exists
        const existing = await Note.findOne({ slug });
        if (existing) {
            return res.status(400).json({ error: 'This slug is already taken' });
        }

        // If enabling password protection, require a password
        if (isPasswordProtected && !password) {
            return res.status(400).json({ error: 'Password is required when enabling password protection' });
        }

        // Hash password if provided
        let passwordHash = null;
        if (isPasswordProtected && password) {
            passwordHash = await bcrypt.hash(password, 10);
        }

        const note = new Note({
            slug,
            title,
            content: content || {},
            owner: req.userId || req.user.userId,
            isPublic: isPublic !== undefined ? isPublic : true, // Default to public
            isPasswordProtected: isPasswordProtected || false,
            passwordHash,
            lastEditedBy: req.userId || req.user.userId
        });

        await note.save();
        res.status(201).json({ note });
    } catch (error) {
        console.error('Create note error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get user's notes (requires auth)
router.get('/', authMiddleware, async (req, res) => {
    try {
        const notes = await Note.find({ owner: req.user.userId })
            .select('-content -passwordHash')
            .sort({ updatedAt: -1 });

        res.json({ notes });
    } catch (error) {
        console.error('Get notes error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get note by slug (public or authenticated)
router.get('/slug/:slug', optionalAuth, async (req, res) => {
    try {
        const { slug } = req.params;

        console.log('Get note by slug:', slug);
        console.log('req.user:', req.user);
        console.log('req.userId:', req.userId);

        const note = await Note.findOne({ slug })
            .populate('owner', 'name username email')
            .populate('lastEditedBy', 'name username')
            .populate('collaborators.userId', 'name username');

        if (!note) {
            return res.status(404).json({ error: 'Note not found' });
        }

        console.log('Note found - owner:', note.owner._id);
        console.log('Note isPublic:', note.isPublic);

        // Check access permissions - check both req.userId and req.user.userId
        const userId = req.userId || (req.user && req.user.userId);
        const isOwner = userId && note.owner._id.toString() === userId;
        const isCollaborator = userId && note.collaborators.some(c => c.userId._id.toString() === userId);

        console.log('userId:', userId);
        console.log('isOwner:', isOwner);
        console.log('isCollaborator:', isCollaborator);

        // If not public and user is not owner/collaborator
        if (!note.isPublic && !isOwner && !isCollaborator) {
            return res.status(403).json({ error: 'Access denied. This note is private.' });
        }

        // Initialize session verifiedNotes array if it doesn't exist
        if (!req.session.verifiedNotes) {
            req.session.verifiedNotes = [];
        }

        // If password protected, check if password has been verified in this session
        // Owner can bypass password protection
        if (note.isPasswordProtected && !req.session.verifiedNotes.includes(slug) && !isOwner) {
            console.log('Password required for note:', slug);
            console.log('Session verified notes:', req.session.verifiedNotes);
            return res.status(401).json({
                error: 'Password required',
                requiresPassword: true,
                note: {
                    slug: note.slug,
                    title: note.title,
                    isPasswordProtected: true
                }
            });
        }

        // Return note (without password hash)
        const noteData = note.toObject();
        delete noteData.passwordHash;

        // Everyone can edit - full collaborative editing
        res.json({
            note: noteData,
            canEdit: true // Always allow editing for real-time collaboration
        });
    } catch (error) {
        console.error('Get note error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Verify password for protected note
router.post('/:slug/verify-password', async (req, res) => {
    try {
        const { slug } = req.params;
        const { password } = req.body;

        if (!password) {
            return res.status(400).json({ error: 'Password is required' });
        }

        const note = await Note.findOne({ slug });
        if (!note) {
            return res.status(404).json({ error: 'Note not found' });
        }

        if (!note.isPasswordProtected) {
            return res.status(400).json({ error: 'This note is not password protected' });
        }

        // Guard against missing password hash (misconfiguration)
        if (!note.passwordHash) {
            return res.status(400).json({ error: 'Password not set by owner. Please ask the owner to set a password.' });
        }

        const isValid = await bcrypt.compare(password, note.passwordHash);
        if (!isValid) {
            return res.status(401).json({ error: 'Incorrect password' });
        }

        // Store verified note in session
        if (!req.session.verifiedNotes) {
            req.session.verifiedNotes = [];
        }
        if (!req.session.verifiedNotes.includes(slug)) {
            req.session.verifiedNotes.push(slug);
        }

        res.json({ message: 'Password verified', verified: true });
    } catch (error) {
        console.error('Verify password error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Update note - now allows anyone to edit (collaborative editing)
router.patch('/:id', optionalAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { title, content, isPublic, isPasswordProtected, password } = req.body;

        const note = await Note.findById(id);
        if (!note) {
            return res.status(404).json({ error: 'Note not found' });
        }

        // Allow anyone to edit content and title for real-time collaboration
        if (title !== undefined) note.title = title;
        if (content !== undefined) note.content = content;

        // Only owner can change privacy/password settings
        const userId = req.userId || (req.user && req.user.userId);
        const isOwner = userId && note.owner.toString() === userId;

        if (isOwner) {
            if (isPublic !== undefined) note.isPublic = isPublic;
            if (isPasswordProtected !== undefined) {
                // If enabling protection without existing hash and no new password, reject
                if (isPasswordProtected && !note.passwordHash && !password) {
                    return res.status(400).json({ error: 'Password is required to enable password protection' });
                }

                note.isPasswordProtected = isPasswordProtected;

                // Update password if provided
                if (isPasswordProtected && password) {
                    note.passwordHash = await bcrypt.hash(password, 10);
                } else if (!isPasswordProtected) {
                    note.passwordHash = null;
                }
            }
        }

        if (userId) {
            note.lastEditedBy = userId;
        }
        await note.save();

        res.json({ note });
    } catch (error) {
        console.error('Update note error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Update note by slug - allows anyone to edit (collaborative editing)
router.patch('/slug/:slug', optionalAuth, async (req, res) => {
    try {
        const { slug } = req.params;
        const { title, content, isPublic, isPasswordProtected, password } = req.body;

        const note = await Note.findOne({ slug });
        if (!note) {
            return res.status(404).json({ error: 'Note not found' });
        }

        // Allow anyone to edit content and title for real-time collaboration
        if (title !== undefined) note.title = title;
        if (content !== undefined) note.content = content;

        // Only owner can change privacy/password settings
        const userId = req.userId || (req.user && req.user.userId);
        const isOwner = userId && note.owner.toString() === userId;

        if (isOwner) {
            if (isPublic !== undefined) note.isPublic = isPublic;
            if (isPasswordProtected !== undefined) {
                // If enabling protection without existing hash and no new password, reject
                if (isPasswordProtected && !note.passwordHash && !password) {
                    return res.status(400).json({ error: 'Password is required to enable password protection' });
                }

                note.isPasswordProtected = isPasswordProtected;

                // Update password if provided
                if (isPasswordProtected && password) {
                    note.passwordHash = await bcrypt.hash(password, 10);
                } else if (!isPasswordProtected) {
                    note.passwordHash = null;
                }
            }
        }

        if (userId) {
            note.lastEditedBy = userId;
        }
        await note.save();

        res.json({ note });
    } catch (error) {
        console.error('Update note by slug error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Update note settings (slug, password, etc.) - owner only
router.patch('/:id/settings', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { slug, isPublic, isPasswordProtected, password } = req.body;

        const note = await Note.findById(id);
        if (!note) {
            return res.status(404).json({ error: 'Note not found' });
        }

        // Only owner can change settings
        if (note.owner.toString() !== req.user.userId) {
            return res.status(403).json({ error: 'Only the owner can change settings' });
        }

        // Update slug if provided and different
        if (slug && slug !== note.slug) {
            const existing = await Note.findOne({ slug });
            if (existing) {
                return res.status(400).json({ error: 'This slug is already taken' });
            }
            note.slug = slug;
        }

        // Update access settings
        if (isPublic !== undefined) note.isPublic = isPublic;
        if (isPasswordProtected !== undefined) {
            // If enabling protection without existing hash and no new password, reject
            if (isPasswordProtected && !note.passwordHash && !password) {
                return res.status(400).json({ error: 'Password is required to enable password protection' });
            }

            note.isPasswordProtected = isPasswordProtected;

            if (isPasswordProtected && password) {
                note.passwordHash = await bcrypt.hash(password, 10);
            } else if (!isPasswordProtected) {
                note.passwordHash = null;
            }
        }

        await note.save();
        res.json({ note });
    } catch (error) {
        console.error('Update settings error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Delete note (owner only)
router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;

        const note = await Note.findById(id);
        if (!note) {
            return res.status(404).json({ error: 'Note not found' });
        }

        // Only owner can delete
        if (note.owner.toString() !== req.user.userId) {
            return res.status(403).json({ error: 'Only the owner can delete this note' });
        }

        await Note.findByIdAndDelete(id);
        res.json({ message: 'Note deleted successfully' });
    } catch (error) {
        console.error('Delete note error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get active collaborators for a note
router.get('/:slug/collaborators', optionalAuth, async (req, res) => {
    try {
        const { slug } = req.params;

        const note = await Note.findOne({ slug })
            .populate('collaborators.userId', 'name username');

        if (!note) {
            return res.status(404).json({ error: 'Note not found' });
        }

        res.json({ collaborators: note.collaborators });
    } catch (error) {
        console.error('Get collaborators error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Add collaborator (owner only)
router.post('/:id/collaborators', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { userId, permission } = req.body;

        const note = await Note.findById(id);
        if (!note) {
            return res.status(404).json({ error: 'Note not found' });
        }

        // Only owner can add collaborators
        if (note.owner.toString() !== req.user.userId) {
            return res.status(403).json({ error: 'Only the owner can add collaborators' });
        }

        // Check if already a collaborator
        if (note.collaborators.some(c => c.userId.toString() === userId)) {
            return res.status(400).json({ error: 'User is already a collaborator' });
        }

        note.collaborators.push({
            userId,
            permission: permission || 'view',
            addedAt: Date.now()
        });

        await note.save();
        await note.populate('collaborators.userId', 'name username');

        res.json({ collaborators: note.collaborators });
    } catch (error) {
        console.error('Add collaborator error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Remove collaborator (owner only)
router.delete('/:id/collaborators/:userId', authMiddleware, async (req, res) => {
    try {
        const { id, userId } = req.params;

        const note = await Note.findById(id);
        if (!note) {
            return res.status(404).json({ error: 'Note not found' });
        }

        // Only owner can remove collaborators
        if (note.owner.toString() !== req.user.userId) {
            return res.status(403).json({ error: 'Only the owner can remove collaborators' });
        }

        note.collaborators = note.collaborators.filter(c => c.userId.toString() !== userId);
        await note.save();

        res.json({ message: 'Collaborator removed', collaborators: note.collaborators });
    } catch (error) {
        console.error('Remove collaborator error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
