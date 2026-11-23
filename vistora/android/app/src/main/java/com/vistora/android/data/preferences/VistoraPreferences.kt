package com.vistora.android.data.preferences

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.vistoraDataStore by preferencesDataStore(name = "vistora_preferences")

data class VistoraPreferences(
    val gridColumns: Int = 2,
    val accent: String = "rose",
    val compactPosters: Boolean = false,
    val reduceMotion: Boolean = false
)

class VistoraPreferencesStore(private val context: Context) {
    private object Keys {
        val gridColumns = intPreferencesKey("grid_columns")
        val accent = stringPreferencesKey("accent")
        val compactPosters = booleanPreferencesKey("compact_posters")
        val reduceMotion = booleanPreferencesKey("reduce_motion")
    }

    val preferences: Flow<VistoraPreferences> = context.vistoraDataStore.data.map { values ->
        VistoraPreferences(
            gridColumns = values[Keys.gridColumns]?.coerceIn(2, 5) ?: 2,
            accent = values[Keys.accent] ?: "rose",
            compactPosters = values[Keys.compactPosters] ?: false,
            reduceMotion = values[Keys.reduceMotion] ?: false
        )
    }

    suspend fun setGridColumns(value: Int) {
        context.vistoraDataStore.edit { it[Keys.gridColumns] = value.coerceIn(2, 5) }
    }

    suspend fun setAccent(value: String) {
        context.vistoraDataStore.edit { it[Keys.accent] = value }
    }

    suspend fun setCompactPosters(value: Boolean) {
        context.vistoraDataStore.edit { it[Keys.compactPosters] = value }
    }

    suspend fun setReduceMotion(value: Boolean) {
        context.vistoraDataStore.edit { it[Keys.reduceMotion] = value }
    }
}
