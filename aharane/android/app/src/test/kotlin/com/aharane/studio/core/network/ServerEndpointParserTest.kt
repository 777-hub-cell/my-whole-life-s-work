package com.aharane.studio.core.network

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ServerEndpointParserTest {
    @Test
    fun studioSubpathKeepsCanonicalUrlAndTriesRootApiFallback() {
        val candidates = ServerEndpointParser.candidates("https://example.test/aharane/studio/")

        assertEquals(2, candidates.size)
        assertEquals("/aharane", candidates[0].prefix)
        assertEquals("", candidates[1].prefix)
        assertEquals("https://example.test/aharane/studio", candidates[0].studioUrl)
        assertEquals(candidates[0].studioUrl, candidates[1].studioUrl)
        assertEquals("https://example.test/aharane/api/status", candidates[0].apiUrl("status").toString())
        assertEquals("https://example.test/api/status", candidates[1].apiUrl("status").toString())
    }

    @Test
    fun rootStudioUrlDoesNotCreateDuplicateCandidates() {
        val candidates = ServerEndpointParser.candidates("https://example.test/studio")

        assertEquals(1, candidates.size)
        assertEquals("", candidates.single().prefix)
        assertTrue(candidates.single().studioUrl.endsWith("/studio"))
    }
}
