package com.aharane.studio.core.notifications

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.job.JobParameters
import android.app.job.JobService
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationManagerCompat
import com.aharane.studio.MainActivity
import com.aharane.studio.core.model.ChatAccount
import com.aharane.studio.core.network.AharaneConnectionManager
import com.aharane.studio.core.network.AharaneRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/**
 * Android may defer periodic jobs according to Doze/battery policy. This checks
 * the two account inboxes without opening WhatsApp or changing read/presence
 * state. Notifications intentionally omit message text for lock-screen privacy.
 */
class AharaneNotificationJobService : JobService() {
    private var jobScope: CoroutineScope? = null

    override fun onStartJob(params: JobParameters): Boolean {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        jobScope = scope
        scope.launch {
            var retry = false
            try {
                if (!notificationsAllowed()) {
                    retry = false
                } else {
                    createNotificationChannel()
                    val manager = AharaneConnectionManager(applicationContext)
                    if (manager.restoreSession()) {
                        val repository = AharaneRepository(manager)
                        ChatAccount.entries.forEach { account ->
                            val chats = repository.chats(account, limit = 300)
                            chats.forEach { chat ->
                                val key = watermarkKey(account, chat.key.jid)
                                val previous = watermarks.getLong(key, Long.MIN_VALUE)
                                val latest = chat.lastMessageAtMillis
                                if (previous == Long.MIN_VALUE) {
                                    // First run establishes a baseline; old messages
                                    // are not reported as freshly received.
                                    watermarks.edit().putLong(key, latest).apply()
                                } else {
                                    if (latest > previous && !chat.lastMessageFromMe) {
                                        postNewMessageNotification(
                                            account = account,
                                            jid = chat.key.jid,
                                            displayName = chat.title
                                        )
                                    }
                                    if (latest > previous) {
                                        watermarks.edit().putLong(key, latest).apply()
                                    }
                                }
                            }
                        }
                    } else {
                        retry = true
                    }
                }
            } catch (_: Exception) {
                retry = true
            } finally {
                jobFinished(params, retry)
                jobScope = null
            }
        }
        return true
    }

    override fun onStopJob(params: JobParameters): Boolean {
        jobScope?.cancel()
        jobScope = null
        return true
    }

    private val watermarks by lazy {
        getSharedPreferences("aharane-notification-watermarks", MODE_PRIVATE)
    }

    private fun notificationsAllowed(): Boolean {
        if (Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return false
        return NotificationManagerCompat.from(this).areNotificationsEnabled()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = getSystemService(NotificationManager::class.java)
        val channel = NotificationChannel(
            CHANNEL_ID,
            "WhatsApp messages",
            NotificationManager.IMPORTANCE_DEFAULT
        ).apply {
            description = "New messages from your connected Private and Public WhatsApp accounts."
            setShowBadge(true)
            lockscreenVisibility = Notification.VISIBILITY_PRIVATE
        }
        manager.createNotificationChannel(channel)
    }

    private fun postNewMessageNotification(account: ChatAccount, jid: String, displayName: String) {
        val intent = Intent(this, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            .putExtra("aharane.notification.account", account.apiValue)
            .putExtra("aharane.notification.jid", jid)

        val pending = PendingIntent.getActivity(
            this,
            notificationId(account, jid),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val notification = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, CHANNEL_ID)
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
        }
            .setSmallIcon(android.R.drawable.sym_action_chat)
            .setContentTitle(displayName.ifBlank { "New message" })
            .setContentText("New message · ${account.label} account")
            .setCategory(Notification.CATEGORY_MESSAGE)
            .setVisibility(Notification.VISIBILITY_PRIVATE)
            .setAutoCancel(true)
            .setContentIntent(pending)
            .build()

        getSystemService(NotificationManager::class.java)
            .notify(account.apiValue, notificationId(account, jid), notification)
    }

    private fun watermarkKey(account: ChatAccount, jid: String): String =
        account.apiValue + ":" + jid

    private fun notificationId(account: ChatAccount, jid: String): Int =
        31 * account.apiValue.hashCode() + jid.hashCode()

    private companion object {
        const val CHANNEL_ID = "aharane-whatsapp-messages-v1"
    }
}
