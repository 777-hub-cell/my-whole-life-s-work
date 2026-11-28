package com.aharane.studio.core.navigation

import org.junit.Assert.assertEquals
import org.junit.Test

class MainDestinationOrderTest {
    @Test
    fun chatsRemainsTheThirdBottomNavigationDestination() {
        assertEquals(
            listOf("HOME", "FILES", "CHATS", "ENVIRONMENT", "MORE"),
            MainDestination.entries.map { it.name }
        )
    }
}
