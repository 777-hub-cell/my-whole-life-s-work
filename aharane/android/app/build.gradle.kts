import java.net.URL

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
}
android {
    namespace = "com.aharane.studio"
    compileSdk = 36
    defaultConfig {
        applicationId = "com.aharane.studio"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }
    buildFeatures { compose = true }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    lint { abortOnError = true }

    // The exact web Studio typefaces are bundled as generated Android resources.
    sourceSets.getByName("main").res.srcDir(layout.buildDirectory.dir("generated/aharane-font-res"))
    sourceSets.getByName("main").assets.srcDir(layout.buildDirectory.dir("generated/aharane-font-assets"))
}

val fetchAharaneFonts by tasks.registering {
    val resourceRoot = layout.buildDirectory.dir("generated/aharane-font-res")
    val assetRoot = layout.buildDirectory.dir("generated/aharane-font-assets")
    outputs.dir(resourceRoot)
    outputs.dir(assetRoot)
    inputs.property("fontSources", "instrument-sans-7fa22308;bricolage-grotesque-84745e5b")
    doLast {
        val fontDir = resourceRoot.get().dir("font").asFile
        val licenseDir = assetRoot.get().dir("fonts").asFile
        fontDir.mkdirs()
        licenseDir.mkdirs()

        fun fetch(url: String, destination: File) {
            if (destination.exists() && destination.length() > 20_000L) return
            val temp = File(destination.parentFile, destination.name + ".part")
            URL(url).openStream().use { input -> temp.outputStream().use { output -> input.copyTo(output) } }
            require(temp.length() > 20_000L) { "Downloaded font is unexpectedly small: \${destination.name}" }
            if (!temp.renameTo(destination)) {
                destination.delete()
                check(temp.renameTo(destination)) { "Unable to install \${destination.name}" }
            }
        }

        fetch(
            "https://raw.githubusercontent.com/Instrument/instrument-sans/7fa22308a3d0c94ee2b3cd537a1196b65db34a3e/fonts/variable/InstrumentSans%5Bwdth%2Cwght%5D.ttf",
            File(fontDir, "instrument_sans.ttf")
        )
        fetch(
            "https://raw.githubusercontent.com/ateliertriay/bricolage/84745e5b96261ae5f8c6c856e262fe78d1d6efdd/fonts/variable/BricolageGrotesque%5Bopsz%2Cwdth%2Cwght%5D.ttf",
            File(fontDir, "bricolage_grotesque.ttf")
        )
        fetch(
            "https://raw.githubusercontent.com/Instrument/instrument-sans/7fa22308a3d0c94ee2b3cd537a1196b65db34a3e/OFL.txt",
            File(licenseDir, "Instrument-Sans-OFL.txt")
        )
        fetch(
            "https://raw.githubusercontent.com/ateliertriay/bricolage/84745e5b96261ae5f8c6c856e262fe78d1d6efdd/OFL.txt",
            File(licenseDir, "Bricolage-Grotesque-OFL.txt")
        )
    }
}
tasks.named("preBuild").configure { dependsOn(fetchAharaneFonts) }

dependencies {
    implementation(libs.androidx.activity.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.icons)
    testImplementation(libs.junit)
}
