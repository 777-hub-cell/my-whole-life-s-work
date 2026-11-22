package com.vistora.android

import android.app.Application
import androidx.room.Room
import com.vistora.android.data.local.VistoraDatabase
import com.vistora.android.data.repository.LibraryRepository
import com.vistora.android.data.repository.RoomLibraryRepository

class VistoraApplication : Application() {
    val database: VistoraDatabase by lazy {
        Room.databaseBuilder(
            applicationContext,
            VistoraDatabase::class.java,
            "vistora-library.db"
        ).build()
    }

    val libraryRepository: LibraryRepository by lazy {
        RoomLibraryRepository(database)
    }
}
