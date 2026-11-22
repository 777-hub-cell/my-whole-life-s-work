package com.vistora.android

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import com.vistora.android.ui.VistoraApp
import com.vistora.android.ui.VistoraViewModel
import com.vistora.android.ui.theme.VistoraTheme

class MainActivity : ComponentActivity() {
    private val viewModel: VistoraViewModel by viewModels {
        VistoraViewModel.Factory((application as VistoraApplication).libraryRepository)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            VistoraTheme {
                VistoraApp(viewModel = viewModel)
            }
        }
    }
}
