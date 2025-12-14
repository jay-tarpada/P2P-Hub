const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const Message = require('../models/Message');
const { authMiddleware } = require('../utils/jwt');

// Decrypt helper (same as in index.js)
const ENCRYPTION_KEY = process.env.CHAT_ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
const IV_LENGTH = 16;
function decrypt(text) {
    try {
        const parts = text.split(':');
        if (parts.length !== 2) return text; // Not encrypted
        const iv = Buffer.from(parts[0], 'hex');
        const encryptedText = parts[1];
        const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
        let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (err) {
        console.error('Decryption error:', err);
        return text; // Return original if decryption fails
    }
}

// Get messages between current user and another user
router.get('/messages/:friendId', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.userId;
        const friendId = req.params.friendId;

        // Fetch messages between the two users
        const messages = await Message.find({
            $or: [
                { from: userId, to: friendId },
                { from: friendId, to: userId }
            ]
        }).sort({ createdAt: 1 });

        // Decrypt messages before sending to client
        const decryptedMessages = messages.map(msg => ({
            from: msg.from,
            to: msg.to,
            text: decrypt(msg.text),
            createdAt: msg.createdAt
        }));

        res.json({ messages: decryptedMessages });
    } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).json({ error: 'Failed to fetch messages' });
    }
});

// Delete all messages for current user (called on logout)
router.delete('/messages', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.userId;

        // Delete all messages sent by or received by this user
        await Message.deleteMany({
            $or: [
                { from: userId },
                { to: userId }
            ]
        });

        res.json({ success: true, message: 'Messages deleted' });
    } catch (error) {
        console.error('Error deleting messages:', error);
        res.status(500).json({ error: 'Failed to delete messages' });
    }
});

module.exports = router;
