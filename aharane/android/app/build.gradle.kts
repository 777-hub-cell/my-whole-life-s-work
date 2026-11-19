import java.net.URL
import org.gradle.api.DefaultTask
import org.gradle.api.file.DirectoryProperty
import org.gradle.api.provider.Property
import org.gradle.api.tasks.Input
import org.gradle.api.tasks.OutputDirectory
import org.gradle.api.tasks.TaskAction

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
}

abstract class FetchAharaneFontsTask : DefaultTask() {
    @get:OutputDirectory
    abstract val resourceDirectory: DirectoryProperty

    @get:OutputDirectory
    abstract val assetDirectory: DirectoryProperty

    @get:Input
    abstract val sourceRevision: Property<String>

    @TaskAction
    fun downloadFontsAndLicenses() {
        val fontDir = resourceDirectory.get().dir("font").asFile
        val licenseDir = assetDirectory.get().dir("fonts").asFile
        fontDir.mkdirs()
        licenseDir.mkdirs()

        fun fetch(url: String, destination: java.io.File, minimumBytes: Long) {
            if (destination.exists() && destination.length() >= minimumBytes) return
            val temp = java.io.File(destination.parentFile, destination.name + ".part")
            val connection = URL(url).openConnection().apply {
                connectTimeout = 30_000
                readTimeout = 60_000
            }
            connection.getInputStream().use { input ->
                temp.outputStream().use { output -> input.copyTo(output) }
            }
            require(temp.length() >= minimumBytes) {
                "Downloaded file is unexpectedly small: " + destination.name
            }
            if (!temp.renameTo(destination)) {
                destination.delete()
                check(temp.renameTo(destination)) {
                    "Unable to install " + destination.name
                }
            }
        }

        fetch(
            "https://raw.githubusercontent.com/Instrument/instrument-sans/7fa22308a3d0c94ee2b3cd537a1196b65db34a3e/fonts/variable/InstrumentSans%5Bwdth%2Cwght%5D.ttf",
            java.io.File(fontDir, "instrument_sans.ttf"),
            20_000L
        )
        fetch(
            "https://raw.githubusercontent.com/ateliertriay/bricolage/84745e5b96261ae5f8c6c856e262fe78d1d6efdd/fonts/variable/BricolageGrotesque%5Bopsz%2Cwdth%2Cwght%5D.ttf",
            java.io.File(fontDir, "bricolage_grotesque.ttf"),
            20_000L
        )
        fetch(
            "https://raw.githubusercontent.com/Instrument/instrument-sans/7fa22308a3d0c94ee2b3cd537a1196b65db34a3e/OFL.txt",
            java.io.File(licenseDir, "Instrument-Sans-OFL.txt"),
            500L
        )
        fetch(
            "https://raw.githubusercontent.com/ateliertriay/bricolage/84745e5b96261ae5f8c6c856e262fe78d1d6efdd/OFL.txt",
            java.io.File(licenseDir, "Bricolage-Grotesque-OFL.txt"),
            500L
        )
    }
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
}

androidComponents {
    onVariants { variant ->
        val variantSuffix = variant.name.replaceFirstChar { it.uppercase() }
        val fontTask = tasks.register<FetchAharaneFontsTask>("fetchAharaneFonts" + variantSuffix) {
            resourceDirectory.set(layout.buildDirectory.dir("generated/aharane-font-res/" + variant.name))
            assetDirectory.set(layout.buildDirectory.dir("generated/aharane-font-assets/" + variant.name))
            sourceRevision.set("instrument-sans-7fa22308;bricolage-grotesque-84745e5b")
        }
        variant.sources.res?.addGeneratedSourceDirectory(
            fontTask,
            FetchAharaneFontsTask::resourceDirectory
        )
        variant.sources.assets?.addGeneratedSourceDirectory(
            fontTask,
            FetchAharaneFontsTask::assetDirectory
        )
    }
}

dependencies {
    implementation(libs.androidx.activity.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.icons)
    testImplementation(libs.junit)
}
