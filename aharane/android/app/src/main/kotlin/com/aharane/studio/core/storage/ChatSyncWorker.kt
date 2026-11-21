package com.aharane.studio.core.storage

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.aharane.studio.core.model.ChatAccount
import com.aharane.studio.core.network.AharaneConnectionManager
import com.aharane.studio.core.network.AharaneRepository
import java.util.concurrent.TimeUnit

/**
 * Low-frequency, Wi-Fi-only background message delta sync.
 * It reads the encrypted saved server session and never sends presence/read receipts
 * or downloads media. User-initiated sync remains available on any connected network.
 */
class ChatSyncWorker(
    appContext: Context,
    params: WorkerParameters
) : CoroutineWorker(appContext, params) {
    override suspend fun doWork(): Result {
        val connection = AharaneConnectionManager(applicationContext)
        if (connection.savedStudioUrl.isBlank()) return Result.success()
        val restored = runCatching { connection.restoreSession() }.getOrDefault(false)
        if (!restored) {
            // No saved session means the user has not connected this installation yet.
            // A saved but temporarily unreachable session should be retried by WorkManager.
            return if (connection.api?.hasSavedSession() == true) Result.retry() else Result.success()
        }

        val repository = AharaneRepository(connection)
        var local: LocalChatRepository? = null
        return try {
            local = LocalChatRepository(applicationContext)
            var failures = 0
            for (account in listOf(ChatAccount.PRIVATE, ChatAccount.PUBLIC)) {
                val conversations = try {
                    repository.chats(account)
                } catch (_: Exception) {
                    failures += 1
                    continue
                }
                val cached = local.saveConversations(conversations)
                cached.take(MAX_CONVERSATIONS_PER_ACCOUNT).forEach { conversation ->
                    try {
                        val cursor = local.newestCursor(conversation.key)
                        val page = repository.syncMessages(
                            conversation,
                            afterMillis = cursor.timestampMillis,
                            afterMessageId = cursor.messageId,
                            limit = MESSAGE_PAGE_SIZE
                        )
                        local.saveMessages(
                            conversation,
                            page.messages,
                            if (cursor.timestampMillis == 0L) page.hasOlder else null
                        )
                        local.applyDeletedMessages(conversation.key, page.deletedMessageIds)
                        local.applyRemoteDeletedMessages(
                            conversation.key,
                            page.remoteDeletedMessages.map { it.messageId to it.deletedAtMillis }
                        )
                    } catch (_: Exception) {
                        failures += 1
                    }
                }
            }
            if (failures > 0) Result.retry() else Result.success()
        } catch (_: Exception) {
            Result.retry()
        } finally {
            local?.close()
        }
    }

    companion object {
        const val WORK_NAME = "aharane-periodic-offline-chat-sync"
        private const val MAX_CONVERSATIONS_PER_ACCOUNT = 40
        private const val MESSAGE_PAGE_SIZE = 100
    }
}

object ChatSyncScheduler {
    fun schedule(context: Context) {
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.UNMETERED)
            .build()
        val request = PeriodicWorkRequestBuilder<ChatSyncWorker>(12, TimeUnit.HOURS)
            .setConstraints(constraints)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.MINUTES)
            .build()
        WorkManager.getInstance(context.applicationContext).enqueueUniquePeriodicWork(
            ChatSyncWorker.WORK_NAME,
            ExistingPeriodicWorkPolicy.KEEP,
            request
        )
    }

    fun cancel(context: Context) {
        WorkManager.getInstance(context.applicationContext).cancelUniqueWork(ChatSyncWorker.WORK_NAME)
    }
}
