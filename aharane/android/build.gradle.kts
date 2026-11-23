buildscript {
    repositories {
        google()
        // Google-hosted Maven Central mirror avoids transient Central 429 throttling.
        maven { url = uri("https://maven-central.storage-download.googleapis.com/maven2/") }
        mavenCentral()
    }
    dependencies {
        // Override AGP's bundled Kotlin Gradle plugin so built-in Kotlin and
        // the Compose compiler plugin use the same pinned Kotlin version.
        classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:2.4.21")
        classpath("org.jetbrains.kotlin.plugin.compose:org.jetbrains.kotlin.plugin.compose.gradle.plugin:2.4.21")
    }
}

plugins {
    alias(libs.plugins.android.application) apply false
}
