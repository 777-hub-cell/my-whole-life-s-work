package com.aharane.studio.core.model

data class PreviewFile(
    val name: String,
    val path: String,
    val isDirectory: Boolean,
    val sizeLabel: String? = null
)

/**
 * Explicit debug-only fixtures for emulator layout verification.
 * They are never used in normal launches or release builds.
 */
object DesignPreviewFixtures {
    private val now = System.currentTimeMillis()

    val privateKey = ConversationKey(ChatAccount.PRIVATE, "15551234567@s.whatsapp.net")
    val publicKey = ConversationKey(ChatAccount.PUBLIC, "15557654321@s.whatsapp.net")

    val activity = listOf(
        "Preview · Private WhatsApp sample session ready",
        "Preview · Files workspace loaded",
        "Preview · Appearance preferences available"
    )

    val conversations = listOf(
        ChatSummary(
            key = privateKey,
            title = "Mira",
            lastMessagePreview = "I sent the document. Let me know what you think.",
            lastMessageAtMillis = now - 4 * 60_000L,
            unreadCount = 2,
            isPinned = true
        ),
        ChatSummary(
            key = ConversationKey(ChatAccount.PRIVATE, "120363401234567890@g.us"),
            title = "Aharane Team",
            lastMessagePreview = "You: The new editor layout is ready for review.",
            lastMessageAtMillis = now - 48 * 60_000L,
            isGroup = true,
            isMuted = true
        ),
        ChatSummary(
            key = publicKey,
            title = "Quincy",
            lastMessagePreview = "The public account is connected.",
            lastMessageAtMillis = now - 2 * 60 * 60_000L,
            unreadCount = 1
        )
    )

    val messages = listOf(
        ChatMessage(
            key = privateKey,
            messageId = "preview-in-1",
            direction = MessageDirection.INCOMING,
            kind = MessageKind.TEXT,
            text = "Hey! Have you had a chance to look at the new Studio screen?",
            timestampMillis = now - 29 * 60_000L
        ),
        ChatMessage(
            key = privateKey,
            messageId = "preview-out-1",
            direction = MessageDirection.OUTGOING,
            kind = MessageKind.TEXT,
            text = "Yes — I’m checking the native layout now.",
            timestampMillis = now - 27 * 60_000L,
            status = MessageStatus.READ
        ),
        ChatMessage(
            key = privateKey,
            messageId = "preview-in-2",
            direction = MessageDirection.INCOMING,
            kind = MessageKind.DOCUMENT,
            text = "",
            timestampMillis = now - 18 * 60_000L,
            mediaMimeType = "application/pdf",
            mediaFileName = "Studio-review.pdf"
        ),
        ChatMessage(
            key = privateKey,
            messageId = "preview-out-2",
            direction = MessageDirection.OUTGOING,
            kind = MessageKind.TEXT,
            text = "Got it. I’ll check the file and reply shortly.",
            timestampMillis = now - 16 * 60_000L,
            status = MessageStatus.DELIVERED,
            replyToMessageId = "preview-in-2"
        ),
        ChatMessage(
            key = privateKey,
            messageId = "preview-in-3",
            direction = MessageDirection.INCOMING,
            kind = MessageKind.IMAGE,
            text = "",
            timestampMillis = now - 8 * 60_000L,
            mediaMimeType = "image/jpeg",
            mediaFileName = "workspace-preview.jpg",
            isViewOnce = true
        )
    )

    val files = listOf(
        PreviewFile("admin", "admin", isDirectory = true),
        PreviewFile("commands", "commands", isDirectory = true),
        PreviewFile("media", "media", isDirectory = true),
        PreviewFile("auth.js", "admin/auth.js", isDirectory = false, sizeLabel = "1.2 KB"),
        PreviewFile("config.js", "config.js", isDirectory = false, sizeLabel = "864 B"),
        PreviewFile("index.js", "index.js", isDirectory = false, sizeLabel = "2.4 KB"),
        PreviewFile("menu.js", "commands/menu.js", isDirectory = false, sizeLabel = "1.1 KB"),
        PreviewFile("package.json", "package.json", isDirectory = false, sizeLabel = "536 B"),
        PreviewFile("ping.js", "commands/ping.js", isDirectory = false, sizeLabel = "743 B"),
        PreviewFile("README.md", "README.md", isDirectory = false, sizeLabel = "2.1 KB")
    )

    val sourceFiles = mapOf(
        "admin/auth.js" to """const allowedOwners = new Set();

function isOwner(jid) {
  return allowedOwners.has(jid);
}

module.exports = { isOwner };
""",
        "config.js" to """module.exports = {
  name: 'Aharane',
  prefix: '.',
  port: 8790
};
""",
        "index.js" to """const config = require('./config');

async function startStudioBot() {
  console.log('Starting ' + config.name);
  return { ready: true };
}

module.exports = { startStudioBot };
""",
        "commands/menu.js" to """module.exports = async function menu(client, message) {
  await message.reply('Aharane commands');
};
""",
        "commands/ping.js" to """module.exports = async function ping(client, message) {
  const started = Date.now();
  await message.reply('Pong · ' + (Date.now() - started) + 'ms');
};
""",
        "package.json" to """{
  "name": "aharane",
  "version": "1.0.0",
  "private": true
}
""",
        "README.md" to """# Aharane
A private WhatsApp companion bot.
"""
    )
}
