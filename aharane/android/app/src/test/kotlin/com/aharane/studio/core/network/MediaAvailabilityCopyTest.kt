package com.aharane.studio.core.network

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class MediaAvailabilityCopyTest {
    @Test
    fun connectionPromptsAreReplacedWithNeutralAttachmentCopy() {
        assertEquals(
            "This attachment isn't available right now.",
            displayableMediaUnavailable("Connect to this WhatsApp account before downloading media.")
        )
        assertEquals(
            "This attachment isn't available right now.",
            displayableMediaUnavailable("The WhatsApp account must be linked before media can be downloaded.")
        )
    }

    @Test
    fun otherMediaAvailabilityDetailsRemainUseful() {
        assertEquals(
            "This media has expired.",
            displayableMediaUnavailable(" This media has expired. ")
        )
        assertNull(displayableMediaUnavailable(""))
        assertNull(displayableMediaUnavailable(null))
    }
}
