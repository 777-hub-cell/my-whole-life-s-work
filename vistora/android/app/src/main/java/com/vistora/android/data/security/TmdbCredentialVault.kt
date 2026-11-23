package com.vistora.android.data.security

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Stores the user's optional TMDB credential as AES-GCM ciphertext.
 * The AES key is generated and retained by Android Keystore; only the
 * encrypted payload and IV are written to private app preferences.
 */
object TmdbCredentialVault {
    private const val KEY_ALIAS = "vistora.tmdb.credential.aes"
    private const val PREFS = "vistora.secure.credentials"
    private const val IV_KEY = "tmdb_iv"
    private const val CIPHER_KEY = "tmdb_ciphertext"
    private val aad = "vistora:tmdb:credential:v1".toByteArray(Charsets.UTF_8)

    suspend fun save(context: Context, credential: String) = withContext(Dispatchers.IO) {
        val clean = credential.trim()
        require(clean.isNotEmpty()) { "Enter a TMDB credential first." }
        require(clean.length <= 4096) { "That credential is unexpectedly long." }

        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey())
        cipher.updateAAD(aad)
        val ciphertext = cipher.doFinal(clean.toByteArray(Charsets.UTF_8))
        val preferences = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        preferences.edit()
            .putString(IV_KEY, Base64.encodeToString(cipher.iv, Base64.NO_WRAP))
            .putString(CIPHER_KEY, Base64.encodeToString(ciphertext, Base64.NO_WRAP))
            .commit()
        Unit
    }

    suspend fun read(context: Context): String? = withContext(Dispatchers.IO) {
        val preferences = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val ivText = preferences.getString(IV_KEY, null) ?: return@withContext null
        val payloadText = preferences.getString(CIPHER_KEY, null) ?: return@withContext null
        runCatching {
            val iv = Base64.decode(ivText, Base64.NO_WRAP)
            val ciphertext = Base64.decode(payloadText, Base64.NO_WRAP)
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), GCMParameterSpec(128, iv))
            cipher.updateAAD(aad)
            cipher.doFinal(ciphertext).toString(Charsets.UTF_8)
        }.getOrNull()
    }

    suspend fun hasCredential(context: Context): Boolean = read(context) != null

    suspend fun clear(context: Context) = withContext(Dispatchers.IO) {
        context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .remove(IV_KEY)
            .remove(CIPHER_KEY)
            .commit()
        runCatching {
            KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
                .deleteEntry(KEY_ALIAS)
        }
        Unit
    }

    private fun getOrCreateKey(): SecretKey {
        val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (keyStore.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }

        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        generator.init(
            KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .setKeySize(256)
                .build()
        )
        return generator.generateKey()
    }
}
