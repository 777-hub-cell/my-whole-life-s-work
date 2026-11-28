package com.aharane.studio.features.chats

import android.content.Context
import android.graphics.BitmapFactory
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.addPathNodes
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.aharane.studio.core.design.StudioPalette
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.security.MessageDigest

/** One locally stored WebP sticker. */
data class StickerEntry(val id: String, val path: String)

private const val MAX_TRAY_STICKERS = 200

/** Content-addressed stickers stay in this app's private files directory. */
class StickerLibrary(context: Context) {
    private val dir = File(context.applicationContext.filesDir, "stickers")

    suspend fun list(): List<StickerEntry> = withContext(Dispatchers.IO) {
        dir.listFiles { file -> file.isFile && file.extension.equals("webp", ignoreCase = true) }
            .orEmpty()
            .sortedByDescending { it.lastModified() }
            .map { StickerEntry(it.nameWithoutExtension, it.absolutePath) }
    }

    suspend fun add(bytes: ByteArray): StickerEntry = withContext(Dispatchers.IO) {
        validateWebpStickerPayload(bytes)?.let { throw IllegalArgumentException(it) }
        if (!dir.exists() && !dir.mkdirs()) error("Could not create the local sticker tray.")
        val id = MessageDigest.getInstance("SHA-256")
            .digest(bytes).joinToString("") { "%02x".format(it) }.take(24)
        val file = File(dir, "$id.webp")
        if (file.exists()) {
            file.setLastModified(System.currentTimeMillis())
        } else {
            val count = dir.listFiles { item -> item.isFile && item.extension.equals("webp", true) }?.size ?: 0
            check(count < MAX_TRAY_STICKERS) {
                "Your sticker tray is full ($MAX_TRAY_STICKERS). Remove a sticker first."
            }
            file.writeBytes(bytes)
        }
        StickerEntry(id, file.absolutePath)
    }

    suspend fun read(entry: StickerEntry): ByteArray = withContext(Dispatchers.IO) {
        val file = File(entry.path)
        require(file.canonicalFile.parentFile == dir.canonicalFile) {
            "That sticker is not in your tray."
        }
        file.readBytes()
    }

    suspend fun remove(entry: StickerEntry) = withContext(Dispatchers.IO) {
        val file = File(entry.path)
        if (file.canonicalFile.parentFile == dir.canonicalFile) file.delete()
    }
}

val StickerIcon: ImageVector by lazy {
    ImageVector.Builder(
        name = "Sticker",
        defaultWidth = 24.dp,
        defaultHeight = 24.dp,
        viewportWidth = 24f,
        viewportHeight = 24f
    ).addPath(
        pathData = addPathNodes(
            "M6 3H18A3 3 0 0 1 21 6V13L13 21H6A3 3 0 0 1 3 18V6A3 3 0 0 1 6 3Z " +
                "M21 13H16A3 3 0 0 0 13 16V21 " +
                "M9 9.2V10.4 M14.5 9.2V10.4 " +
                "M8.8 13.4C10.2 15.2 12.2 15.2 13.6 13.8"
        ),
        stroke = SolidColor(Color.Black),
        strokeLineWidth = 1.7f,
        strokeLineCap = StrokeCap.Round,
        strokeLineJoin = StrokeJoin.Round
    ).build()
}

@Composable
fun StickerTrayPanel(
    stickers: List<StickerEntry>,
    canSend: Boolean,
    onSend: (StickerEntry) -> Unit,
    onAdd: () -> Unit,
    onDelete: (StickerEntry) -> Unit,
    onRecent: () -> Unit = {}
) {
    Column(
        Modifier.fillMaxWidth()
            .background(StudioPalette.Surface)
            .padding(horizontal = 12.dp, vertical = 10.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Stickers", color = StudioPalette.Ink, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.weight(1f))
            Text(
                "Recently sent",
                color = StudioPalette.Accent,
                fontSize = 11.5.sp,
                modifier = Modifier.clip(RoundedCornerShape(8.dp))
                    .clickable(onClick = onRecent)
                    .padding(horizontal = 8.dp, vertical = 5.dp)
            )
        }
        LazyVerticalGrid(
            columns = GridCells.Adaptive(84.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.heightIn(max = 236.dp).padding(top = 10.dp)
        ) {
            item(key = "add") {
                Box(
                    Modifier.aspectRatio(1f).clip(RoundedCornerShape(14.dp))
                        .background(StudioPalette.Background)
                        .border(1.dp, StudioPalette.Line, RoundedCornerShape(14.dp))
                        .clickable(onClick = onAdd),
                    contentAlignment = Alignment.Center
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("+", color = StudioPalette.Accent, fontSize = 30.sp, fontWeight = FontWeight.Light)
                        Text(
                            "Import WebP sticker",
                            color = StudioPalette.Muted,
                            fontSize = 9.sp,
                            textAlign = TextAlign.Center,
                            maxLines = 2
                        )
                    }
                }
            }
            items(stickers, key = { it.id }) { entry ->
                var menuOpen by remember { mutableStateOf(false) }
                Box(
                    Modifier.aspectRatio(1f).clip(RoundedCornerShape(14.dp))
                        .background(StudioPalette.Background)
                        .combinedClickable(
                            onClick = { if (canSend) onSend(entry) },
                            onLongClick = { menuOpen = true }
                        )
                        .padding(6.dp),
                    contentAlignment = Alignment.Center
                ) {
                    StickerThumbnail(entry)
                    DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                        DropdownMenuItem(
                            text = { Text("Remove from tray") },
                            onClick = {
                                menuOpen = false
                                onDelete(entry)
                            }
                        )
                    }
                }
            }
        }
        if (stickers.isEmpty()) {
            Text(
                "Your saved stickers will appear here.",
                color = StudioPalette.Muted,
                fontSize = 11.5.sp,
                modifier = Modifier.padding(top = 7.dp)
            )
        }
        if (!canSend) {
            Text(
                "Sign in to send stickers.",
                color = StudioPalette.Muted,
                fontSize = 12.sp,
                modifier = Modifier.padding(top = 8.dp)
            )
        }
    }
}

@Composable
private fun StickerThumbnail(entry: StickerEntry) {
    val bitmap by produceState<ImageBitmap?>(initialValue = null, entry.path) {
        value = withContext(Dispatchers.IO) {
            runCatching {
                val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                BitmapFactory.decodeFile(entry.path, bounds)
                var sample = 1
                while (maxOf(bounds.outWidth, bounds.outHeight) / sample > 256 && sample < 32) {
                    sample *= 2
                }
                BitmapFactory.decodeFile(
                    entry.path,
                    BitmapFactory.Options().apply { inSampleSize = sample }
                )?.asImageBitmap()
            }.getOrNull()
        }
    }
    bitmap?.let { image ->
        Image(
            bitmap = image,
            contentDescription = "Sticker",
            contentScale = ContentScale.Fit,
            modifier = Modifier.fillMaxWidth().aspectRatio(1f)
        )
    }
}
