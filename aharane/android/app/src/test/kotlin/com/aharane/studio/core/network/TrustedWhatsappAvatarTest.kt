package com.aharane.studio.core.network

import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

class TrustedWhatsappAvatarTest {
    @Test fun acceptsActualWhatsAppPhotoHostsOnly() {
        assertNotNull(trustedWhatsappAvatarUrl("https://pps.whatsapp.net/v/t61.24694-24/s96x96/photo.jpg"))
        assertNotNull(trustedWhatsappAvatarUrl("https://scontent.xx.fbcdn.net/v/t1.0/photo.jpg"))
        assertNotNull(trustedWhatsappAvatarUrl("https://lookaside.fbsbx.com/whatsapp-photo"))
    }

    @Test fun rejectsNonHttpsPrivateNetworksOrHostSpoofing() {
        val invalid = listOf(
            "http://pps.whatsapp.net/photo",
            "https://pps.whatsapp.net.evil.example/photo",
            "https://evil.example/?domain=whatsapp.net",
            "https://127.0.0.1/photo",
            "file:///etc/passwd",
            "https://pps.whatsapp.net:4443/photo",
            "https://user@pps.whatsapp.net/photo",
            "javascript:alert(1)"
        )
        invalid.forEach { assertNull(it, trustedWhatsappAvatarUrl(it)) }
    }
}
