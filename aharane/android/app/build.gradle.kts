buildscript {
    repositories { gradlePluginPortal(); mavenCentral() }
    dependencies {
        classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:2.4.21")
        classpath("org.jetbrains.kotlin.plugin.compose:org.jetbrains.kotlin.plugin.compose.gradle.plugin:2.4.21")
    }
}

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.ksp)
}

apply(plugin = "org.jetbrains.kotlin.plugin.compose")

val releaseKeystorePath = providers.environmentVariable("AHARANE_RELEASE_KEYSTORE_PATH").orNull
val releaseStorePassword = providers.environmentVariable("AHARANE_RELEASE_STORE_PASSWORD").orNull
val releaseKeyAlias = providers.environmentVariable("AHARANE_RELEASE_KEY_ALIAS").orNull
val releaseKeyPassword = providers.environmentVariable("AHARANE_RELEASE_KEY_PASSWORD").orNull
val releaseSigningConfigured = listOf(
    releaseKeystorePath,
    releaseStorePassword,
    releaseKeyAlias,
    releaseKeyPassword
).all { !it.isNullOrBlank() }

val appVersionCode = providers.gradleProperty("aharaneVersionCode").orNull?.toIntOrNull() ?: 1

val releaseBuildRequested = gradle.startParameter.taskNames.any {
    it.endsWith("assembleRelease", ignoreCase = true) ||
        it.endsWith("bundleRelease", ignoreCase = true)
}
val requireReleaseSigning = providers.gradleProperty("aharaneRequireReleaseSigning").orNull?.toBoolean() ?: false

if (releaseBuildRequested && requireReleaseSigning && !releaseSigningConfigured) {
    throw GradleException(
        "Aharane release signing is not configured. Set AHARANE_RELEASE_KEYSTORE_PATH, " +
            "AHARANE_RELEASE_STORE_PASSWORD, AHARANE_RELEASE_KEY_ALIAS and " +
            "AHARANE_RELEASE_KEY_PASSWORD. Never commit the keystore or passwords."
    )
}

android {
    namespace = "com.aharane.studio"
    compileSdk = 36
    defaultConfig {
        applicationId = "com.aharane.studio"
        minSdk = 26
        targetSdk = 36
        versionCode = appVersionCode
        versionName = "0.1.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }
    signingConfigs {
        if (releaseSigningConfigured) {
            create("release") {
                storeFile = file(releaseKeystorePath!!)
                storePassword = releaseStorePassword
                keyAlias = releaseKeyAlias
                keyPassword = releaseKeyPassword
            }
        }
    }
    buildTypes {
        getByName("release") {
            // Keep first signed releases unminified until release-specific coverage is complete.
            isMinifyEnabled = false
            if (releaseSigningConfigured) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }
    buildFeatures { compose = true }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    lint { abortOnError = true }
}

ksp {
    arg("room.schemaLocation", "$projectDir/schemas")
}

dependencies {
    implementation(libs.androidx.activity.compose)
    implementation("androidx.core:core-splashscreen:1.2.0")
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.icons)
    implementation(libs.room.runtime)
    implementation(libs.room.ktx)
    implementation(libs.androidx.sqlite)
    implementation(libs.sqlcipher)
    implementation(libs.work.ktx)
    implementation("com.google.zxing:core:3.5.3")
    ksp(libs.room.compiler)
    testImplementation(libs.junit)
    testImplementation(libs.room.testing)
    androidTestImplementation(libs.androidx.test.junit)
    androidTestImplementation(libs.androidx.test.runner)
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.compose.ui.test.junit4)
    androidTestImplementation(libs.androidx.sqlite.framework)
    androidTestImplementation(libs.work.testing)
    debugImplementation(libs.androidx.compose.ui.test.manifest)
}
