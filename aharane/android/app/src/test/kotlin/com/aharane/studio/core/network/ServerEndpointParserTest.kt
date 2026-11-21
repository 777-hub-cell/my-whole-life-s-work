package com.aharane.studio.core.network

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ServerEndpointParserTest {
    @Test
    fun studioSubpathIsPreservedForAuthenticatedApiRequests() {
        val candidates = ServerEndpointParser.candidates("https://example.test/aharane/studio/")

        assertEquals(1, candidates.size)
        assertEquals("/aharane", candidates.single().prefix)
        assertEquals("https://example.test/aharane/studio", candidates.single().studioUrl)
        assertEquals(
            "https://example.test/aharane/api/status",
            candidates.single().apiUrl("status").toString()
        )
    }

    @Test
    fun rootStudioUrlUsesRootApiWithoutDuplicatingCandidates() {
        val candidates = ServerEndpointParser.candidates("https://example.test/studio")

        assertEquals(1, candidates.size)
        assertEquals("", candidates.single().prefix)
        assertEquals("https://example.test/api/status", candidates.single().apiUrl("status").toString())
        assertTrue(candidates.single().studioUrl.endsWith("/studio"))
    }
}
