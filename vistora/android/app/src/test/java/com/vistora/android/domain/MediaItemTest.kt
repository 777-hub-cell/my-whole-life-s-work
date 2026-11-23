package com.vistora.android.domain

import org.junit.Assert.assertEquals
import org.junit.Test

class MediaItemTest {
    @Test
    fun progressPercentUsesWatchedEpisodeRatio() {
        val item = MediaItem(
            title = "Example",
            type = MediaType.ANIME,
            totalEpisodes = 40,
            watchedEpisodes = 12
        )

        assertEquals(30, item.progressPercent)
    }

    @Test
    fun progressPercentIsZeroWhenTitleHasNoEpisodes() {
        val movie = MediaItem(
            title = "A Film",
            type = MediaType.MOVIE
        )

        assertEquals(0, movie.progressPercent)
    }

    @Test
    fun progressPercentClampsWatchedEpisodesToTotal() {
        val item = MediaItem(
            title = "Example",
            type = MediaType.TV_SERIES,
            totalEpisodes = 10,
            watchedEpisodes = 14
        )

        assertEquals(100, item.progressPercent)
    }

    @Test
    fun progressPercentDoesNotBecomeNegative() {
        val item = MediaItem(
            title = "Example",
            type = MediaType.K_DRAMA,
            totalEpisodes = 12,
            watchedEpisodes = -3
        )

        assertEquals(0, item.progressPercent)
    }

    @Test
    fun movieIsNotEpisodic() {
        val item = MediaItem(
            title = "A Film",
            type = MediaType.MOVIE
        )

        assertEquals(false, item.isEpisodic)
    }

    @Test
    fun seriesWithEpisodeTotalIsEpisodic() {
        val item = MediaItem(
            title = "A Series",
            type = MediaType.TV_SERIES,
            totalEpisodes = 8
        )

        assertEquals(true, item.isEpisodic)
    }
}
