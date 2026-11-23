package com.vistora.android.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.SheetValue
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.vistora.android.ui.theme.VistoraPalette

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun VistoraSheet(
    onDismiss: () -> Unit,
    content: @Composable ColumnScope.() -> Unit
) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = VistoraPalette.Raised,
        contentColor = VistoraPalette.Text,
        dragHandle = {
            Box(
                Modifier.fillMaxWidth().padding(top=8.dp,bottom=12.dp),
                contentAlignment=Alignment.Center
            ) {
                Box(Modifier.width(38.dp).height(4.dp).background(VistoraPalette.LineStrong,RoundedCornerShape(4.dp)))
            }
        },
        tonalElevation = 0.dp,
        scrimColor = Color.Black.copy(alpha=.62f),
        content = content
    )
}
