package com.vistora.android.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.vistora.android.data.preferences.VistoraPreferences
import com.vistora.android.ui.components.SectionHeading
import com.vistora.android.ui.components.VistoraIcon
import com.vistora.android.ui.theme.VistoraPalette

@Composable
fun SettingsScreen(
    preferences:VistoraPreferences,
    onGrid:(Int)->Unit,
    onAccent:(String)->Unit,
    onBackup:()->Unit,
    onRestore:()->Unit,
    onReset:()->Unit
){
    Column(Modifier.fillMaxSize().background(VistoraPalette.Ink).padding(horizontal=20.dp).padding(top=18.dp,bottom=28.dp),verticalArrangement=Arrangement.spacedBy(21.dp)){
        Column{
            Text("Settings",color=VistoraPalette.Text,style=androidx.compose.material3.MaterialTheme.typography.headlineLarge)
            Text("Make VISTORA feel like your own.",color=VistoraPalette.Muted,fontSize=14.sp,modifier=Modifier.padding(top=4.dp))
        }
        SectionHeading("Library")
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(VistoraPalette.Surface).padding(15.dp),verticalArrangement=Arrangement.spacedBy(12.dp)){
            Text("Poster grid",color=VistoraPalette.Text,fontSize=14.sp)
            Text("Choose how many covers fit across your library.",color=VistoraPalette.Muted,fontSize=12.sp)
            Row(horizontalArrangement=Arrangement.spacedBy(8.dp)){
                (2..5).forEach{value->
                    Box(Modifier.weight(1f).height(42.dp).clip(RoundedCornerShape(10.dp)).background(if(preferences.gridColumns==value)VistoraPalette.Burgundy else VistoraPalette.Raised).clickable{onGrid(value)},contentAlignment=Alignment.Center){
                        Text(value.toString(),color=if(preferences.gridColumns==value)VistoraPalette.OnAccent else VistoraPalette.Secondary,fontSize=14.sp)
                    }
                }
            }
        }
        SectionHeading("Appearance")
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(VistoraPalette.Surface).padding(15.dp),verticalArrangement=Arrangement.spacedBy(12.dp)){
            Text("Accent colour",color=VistoraPalette.Text,fontSize=14.sp)
            Row(horizontalArrangement=Arrangement.spacedBy(13.dp),verticalAlignment=Alignment.CenterVertically){
                AccentOption("rose",ColorSwatchRose(),preferences.accent=="rose"){onAccent("rose")}
                AccentOption("burgundy",VistoraPalette.Burgundy,preferences.accent=="burgundy"){onAccent("burgundy")}
            }
            Text("The default ink, burgundy and dusty-rose theme remains the VISTORA signature.",color=VistoraPalette.Muted,fontSize=12.sp,lineHeight=18.sp)
        }
        SectionHeading("Your data")
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(VistoraPalette.Surface).padding(15.dp),verticalArrangement=Arrangement.spacedBy(13.dp)){
            Text("Everything in your library is stored on this device. VISTORA does not need an account, cloud service or VISTORA server.",color=VistoraPalette.Secondary,fontSize=13.sp,lineHeight=19.sp)
            SettingsAction("Export a local backup","bookmark",onBackup)
            Box(Modifier.fillMaxWidth().height(1.dp).background(VistoraPalette.Line))
            SettingsAction("Restore from backup","edit",onRestore)
            Box(Modifier.fillMaxWidth().height(1.dp).background(VistoraPalette.Line))
            SettingsAction("Clear your library","trash",onReset,true)
        }
        SectionHeading("About VISTORA")
        Column(verticalArrangement=Arrangement.spacedBy(5.dp)){
            Text("Your entertainment, all in one place.",color=VistoraPalette.Secondary,fontSize=13.sp)
            Text("Native Android · Local-first · No server",color=VistoraPalette.Muted,fontSize=12.sp)
            Text("VISTORA 0.1.0 · Private watch diary",color=VistoraPalette.Muted,fontSize=11.sp)
        }
    }
}

@Composable
private fun SettingsAction(label:String,icon:String,onClick:()->Unit,danger:Boolean=false){
    Row(Modifier.fillMaxWidth().heightIn(min=48.dp).clickable(onClick=onClick),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(11.dp)){
        VistoraIcon(icon,Modifier.size(19.dp),if(danger)VistoraPalette.DroppedText else VistoraPalette.Secondary)
        Text(label,color=if(danger)VistoraPalette.DroppedText else VistoraPalette.Text,fontSize=13.sp,modifier=Modifier.weight(1f))
        VistoraIcon("back",Modifier.size(15.dp),VistoraPalette.Muted)
    }
}

@Composable
private fun AccentOption(label:String,color:androidx.compose.ui.graphics.Color,selected:Boolean,onClick:()->Unit){
    Row(Modifier.clip(RoundedCornerShape(10.dp)).clickable(onClick=onClick).background(if(selected)VistoraPalette.Raised else androidx.compose.ui.graphics.Color.Transparent).padding(8.dp),
        verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(7.dp)){
        Box(Modifier.size(22.dp).clip(RoundedCornerShape(7.dp)).background(color))
        Text(label.replaceFirstChar{it.uppercase()},color=VistoraPalette.Secondary,fontSize=12.sp)
        if(selected)VistoraIcon("check",Modifier.size(15.dp),VistoraPalette.Rose)
    }
}

private fun ColorSwatchRose()=VistoraPalette.Rose
