package com.vistora.android.data.local

import androidx.room.Database
import androidx.room.RoomDatabase

@Database(
    entities = [MediaEntity::class, EpisodeNoteEntity::class],
    version = 1,
    exportSchema = true
)
abstract class VistoraDatabase : RoomDatabase() {
    abstract fun mediaDao(): MediaDao
    abstract fun episodeNoteDao(): EpisodeNoteDao
}
