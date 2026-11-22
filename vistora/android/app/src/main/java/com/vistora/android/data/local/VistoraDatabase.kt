package com.vistora.android.data.local

import androidx.room.Database
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

@Database(
    entities = [MediaEntity::class, EpisodeNoteEntity::class],
    version = 2,
    exportSchema = true
)
abstract class VistoraDatabase : RoomDatabase() {
    abstract fun mediaDao(): MediaDao
    abstract fun episodeNoteDao(): EpisodeNoteDao
}

/** Adds the separate last-edited timestamp for Overall Thoughts. */
val VISTORA_MIGRATION_1_2 = object : Migration(1, 2) {
    override fun migrate(database: SupportSQLiteDatabase) {
        database.execSQL("ALTER TABLE media_items ADD COLUMN overallThoughtsUpdatedAt INTEGER")
    }
}
