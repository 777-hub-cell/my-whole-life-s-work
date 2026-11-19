package com.aharane.studio.core.design

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ChatBubbleOutline
import androidx.compose.material.icons.outlined.FolderOpen
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.MoreHoriz
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.Terminal
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.Path
import androidx.compose.foundation.Canvas
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.aharane.studio.core.navigation.MainDestination

@Composable
fun StudioHeader(onStatusClick: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().background(StudioPalette.Background)
            .padding(horizontal = 16.dp, vertical = 6.dp).height(42.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(9.dp)) {
            Box(
                modifier = Modifier.size(26.dp).clip(RoundedCornerShape(8.dp))
                    .background(StudioPalette.Accent),
                contentAlignment = Alignment.Center
            ) {
                Canvas(Modifier.size(15.dp)) {
                    val sw = 2.0.dp.toPx()
                    drawLine(Color.White, Offset(size.width * .12f, size.height * .88f),
                        Offset(size.width * .50f, size.height * .12f), sw, cap = StrokeCap.Round)
                    drawLine(Color.White, Offset(size.width * .50f, size.height * .12f),
                        Offset(size.width * .88f, size.height * .88f), sw, cap = StrokeCap.Round)
                    drawLine(Color.White, Offset(size.width * .34f, size.height * .58f),
                        Offset(size.width * .66f, size.height * .58f), sw, cap = StrokeCap.Round)
                }
            }
            Text(
                "Aharane",
                color = StudioPalette.Ink,
                fontSize = 21.sp,
                lineHeight = 25.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = (-0.35).sp
            )
        }
        Spacer(Modifier.weight(1f))
        Box(
            modifier = Modifier.size(38.dp).clip(CircleShape)
                .background(StudioPalette.Surface)
                .border(1.dp, StudioPalette.Line, CircleShape)
                .clickable(onClick = onStatusClick),
            contentAlignment = Alignment.Center
        ) {
            Box(Modifier.size(12.dp).clip(CircleShape).background(StudioPalette.Bad))
        }
    }
}

@Composable
fun StudioBottomNavigation(
    selected: MainDestination,
    onNavigate: (MainDestination) -> Unit
) {
    Column(Modifier.fillMaxWidth().background(StudioPalette.Surface).navigationBarsPadding()) {
        Box(Modifier.fillMaxWidth().height(1.dp).background(StudioPalette.Line))
        Row(Modifier.fillMaxWidth().height(58.dp), verticalAlignment = Alignment.CenterVertically) {
            MainDestination.entries.forEach { destination ->
                val active = selected == destination
                val tint = if (active) StudioPalette.Accent else StudioPalette.Muted
                Column(
                    modifier = Modifier.weight(1f).fillMaxHeight()
                        .clickable { onNavigate(destination) }
                        .padding(top = 7.dp, bottom = 5.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(3.dp, Alignment.CenterVertically)
                ) {
                    val icon = when (destination) {
                        MainDestination.HOME -> Icons.Outlined.Home
                        MainDestination.CHATS -> Icons.Outlined.ChatBubbleOutline
                        MainDestination.FILES -> Icons.Outlined.FolderOpen
                        MainDestination.ENVIRONMENT -> Icons.Outlined.Terminal
                        MainDestination.MORE -> Icons.Outlined.MoreHoriz
                    }
                    Box(
                        Modifier.height(26.dp).width(52.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(21.dp))
                    }
                    Text(
                        destination.label,
                        color = tint,
                        fontSize = 11.5.sp,
                        lineHeight = 13.sp,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1
                    )
                }
            }
        }
    }
}

@Composable
fun StudioPageTitle(title: String, subtitle: String? = null) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(
            title,
            color = StudioPalette.Ink,
            fontSize = 30.sp,
            lineHeight = 34.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = (-0.7).sp
        )
        if (subtitle != null) {
            Text(
                subtitle,
                color = StudioPalette.Muted,
                fontSize = 15.sp,
                lineHeight = 21.sp
            )
        }
    }
}

@Composable
fun StudioSectionHeading(title: String, action: String? = null, onAction: (() -> Unit)? = null) {
    Row(
        Modifier.fillMaxWidth().padding(top = 22.dp, bottom = 10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(title, color = StudioPalette.Ink, fontSize = 17.sp, lineHeight = 22.sp,
            fontWeight = FontWeight.Bold, letterSpacing = (-0.15).sp)
        Spacer(Modifier.weight(1f))
        if (action != null && onAction != null) {
            Text(action, color = StudioPalette.Accent, fontSize = 13.sp, fontWeight = FontWeight.SemiBold,
                modifier = Modifier.clip(RoundedCornerShape(8.dp)).clickable(onClick = onAction).padding(6.dp))
        }
    }
}

@Composable
fun StudioCard(
    modifier: Modifier = Modifier,
    padding: PaddingValues = PaddingValues(0.dp),
    content: @Composable ColumnScope.() -> Unit
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        color = StudioPalette.Surface,
        shape = RoundedCornerShape(18.dp),
        border = BorderStroke(1.dp, StudioPalette.Line),
        shadowElevation = 1.dp
    ) {
        Column(Modifier.padding(padding), content = content)
    }
}

@Composable
fun StudioDivider() {
    Box(Modifier.fillMaxWidth().height(1.dp).background(StudioPalette.Line))
}

@Composable
fun StudioStatusDot(online: Boolean, modifier: Modifier = Modifier, size: Int = 8) {
    Box(modifier.size(size.dp).clip(CircleShape).background(if (online) StudioPalette.Accent else StudioPalette.Bad))
}

@Composable
fun StudioTag(text: String, accent: Boolean = false) {
    Text(
        text,
        color = if (accent) StudioPalette.Accent else StudioPalette.Muted,
        fontSize = 12.5.sp,
        lineHeight = 16.sp,
        fontWeight = FontWeight.SemiBold,
        modifier = Modifier.clip(RoundedCornerShape(99.dp))
            .background(if (accent) StudioPalette.Soft else StudioPalette.Background)
            .padding(horizontal = 10.dp, vertical = 6.dp)
    )
}

@Composable
fun StudioRow(
    title: String,
    subtitle: String? = null,
    icon: ImageVector? = null,
    trailing: String? = null,
    onClick: (() -> Unit)? = null
) {
    Row(
        modifier = Modifier.fillMaxWidth()
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)
            .padding(horizontal = 14.dp, vertical = 12.dp)
            .heightIn(min = 36.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        if (icon != null) {
            Box(
                Modifier.size(38.dp).clip(RoundedCornerShape(11.dp))
                    .background(StudioPalette.Background),
                contentAlignment = Alignment.Center
            ) {
                Icon(icon, contentDescription = null, tint = StudioPalette.Muted, modifier = Modifier.size(20.dp))
            }
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(title, color = StudioPalette.Ink, fontSize = 14.sp, lineHeight = 18.sp,
                fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (subtitle != null) {
                Text(subtitle, color = StudioPalette.Muted, fontSize = 12.5.sp, lineHeight = 17.sp,
                    maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
        }
        if (trailing != null) {
            Text(trailing, color = StudioPalette.Muted, fontSize = 12.sp, fontWeight = FontWeight.SemiBold,
                maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

@Composable
fun StudioActionButton(
    label: String,
    modifier: Modifier = Modifier,
    primary: Boolean = false,
    compact: Boolean = false,
    enabled: Boolean = true,
    onClick: () -> Unit
) {
    val background = if (primary) StudioPalette.Accent else StudioPalette.Surface
    val foreground = if (primary) Color.White else StudioPalette.Ink
    Box(
        modifier = modifier.defaultMinSize(minHeight = if (compact) 36.dp else 44.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(background)
            .border(1.dp, if (primary) StudioPalette.Accent else StudioPalette.Line, RoundedCornerShape(12.dp))
            .clickable(enabled = enabled, onClick = onClick)
            .padding(horizontal = if (compact) 11.dp else 14.dp, vertical = if (compact) 6.dp else 10.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(label, color = foreground.copy(alpha = if (enabled) 1f else .45f),
            fontSize = if (compact) 13.sp else 14.sp, lineHeight = 18.sp, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
fun StudioSearchField(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    modifier: Modifier = Modifier
) {
    Surface(
        modifier = modifier.fillMaxWidth().heightIn(min = 46.dp),
        shape = RoundedCornerShape(12.dp),
        color = StudioPalette.Surface,
        border = BorderStroke(1.dp, StudioPalette.Line)
    ) {
        Row(
            Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(Icons.Outlined.Search, contentDescription = null, tint = StudioPalette.Muted, modifier = Modifier.size(19.dp))
            Spacer(Modifier.width(9.dp))
            Box(Modifier.weight(1f), contentAlignment = Alignment.CenterStart) {
                if (value.isEmpty()) Text(placeholder, color = StudioPalette.Muted, fontSize = 14.sp)
                BasicTextField(
                    value = value,
                    onValueChange = onValueChange,
                    singleLine = true,
                    textStyle = MaterialTheme.typography.bodyMedium.copy(color = StudioPalette.Ink, fontSize = 14.sp),
                    modifier = Modifier.fillMaxWidth()
                )
            }
        }
    }
}

@Composable
fun StudioSegmented(
    options: List<String>,
    selected: String,
    onSelect: (String) -> Unit
) {
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(StudioPalette.Background)
            .padding(3.dp),
        horizontalArrangement = Arrangement.spacedBy(2.dp)
    ) {
        options.forEach { option ->
            val active = option == selected
            Box(
                Modifier.weight(1f).defaultMinSize(minHeight = 38.dp)
                    .clip(RoundedCornerShape(9.dp))
                    .background(if (active) StudioPalette.Surface else Color.Transparent)
                    .then(if (active) Modifier.border(1.dp, StudioPalette.Line, RoundedCornerShape(9.dp)) else Modifier)
                    .clickable { onSelect(option) }.padding(horizontal = 4.dp, vertical = 8.dp),
                contentAlignment = Alignment.Center
            ) {
                Text(option, color = if (active) StudioPalette.Ink else StudioPalette.Muted,
                    fontSize = 13.sp, lineHeight = 17.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
            }
        }
    }
}

@Composable
fun StudioEmpty(title: String, description: String? = null, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 28.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        Text(title, color = StudioPalette.Muted, fontSize = 14.sp, lineHeight = 19.sp,
            fontWeight = FontWeight.SemiBold)
        if (description != null) {
            Text(description, color = StudioPalette.Muted, fontSize = 13.sp, lineHeight = 18.sp,
                textAlign = androidx.compose.ui.text.style.TextAlign.Center)
        }
    }
}

object StudioPalette {
    val Background: Color @Composable get() = MaterialTheme.colorScheme.background
    val Surface: Color @Composable get() = MaterialTheme.colorScheme.surface
    val Ink: Color @Composable get() = MaterialTheme.colorScheme.onSurface
    val Muted: Color @Composable get() = MaterialTheme.colorScheme.onSurfaceVariant
    val Line: Color @Composable get() = MaterialTheme.colorScheme.outline
    val Accent: Color @Composable get() = MaterialTheme.colorScheme.primary
    val Soft: Color @Composable get() = MaterialTheme.colorScheme.primaryContainer
    val Bad: Color @Composable get() = MaterialTheme.colorScheme.error
}
