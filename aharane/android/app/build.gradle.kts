import java.io.File
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
    alias(libs.plugins.ksp)
}

abstract class FetchAharaneFontsTask : DefaultTask() {
    @get:OutputDirectory
    abstract val androidResourceDirectory: DirectoryProperty

    @get:OutputDirectory
    abstract val licenseAssetDirectory: DirectoryProperty

    @get:Input
    abstract val pinnedFontRevisions: Property<String>

    @TaskAction
    fun fetchFonts() {
        val fontDirectory = androidResourceDirectory.get().dir("font").asFile
        val licenseDirectory = licenseAssetDirectory.get().dir("fonts").asFile
        fontDirectory.mkdirs()
        licenseDirectory.mkdirs()

        fun download(url: String, destination: File, minimumBytes: Long) {
            if (destination.exists() && destination.length() >= minimumBytes) return
            destination.parentFile?.mkdirs()
            val temporary = File(destination.parentFile, destination.name + ".part")
            temporary.delete()

            val connection = URL(url).openConnection().apply {
                connectTimeout = 20_000
                readTimeout = 45_000
            }
            connection.getInputStream().use { input ->
                temporary.outputStream().use { output -> input.copyTo(output) }
            }

            require(temporary.length() >= minimumBytes) {
                "Downloaded resource is unexpectedly small: \${destination.name}"
            }
            if (!temporary.renameTo(destination)) {
                destination.delete()
                check(temporary.renameTo(destination)) {
                    "Unable to install generated resource: \${destination.name}"
                }
            }
        }

        // Pinned upstream commits keep builds reproducible and make font provenance auditable.
        download(
            "https://raw.githubusercontent.com/Instrument/instrument-sans/7fa22308a3d0c94ee2b3cd537a1196b65db34a3e/fonts/variable/InstrumentSans%5Bwdth%2Cwght%5D.ttf",
            File(fontDirectory, "instrument_sans.ttf"),
            20_000L
        )
        download(
            "https://raw.githubusercontent.com/ateliertriay/bricolage/84745e5b96261ae5f8c6c856e262fe78d1d6efdd/fonts/variable/BricolageGrotesque%5Bopsz%2Cwdth%2Cwght%5D.ttf",
            File(fontDirectory, "bricolage_grotesque.ttf"),
            20_000L
        )
        download(
            "https://raw.githubusercontent.com/Instrument/instrument-sans/7fa22308a3d0c94ee2b3cd537a1196b65db34a3e/OFL.txt",
            File(licenseDirectory, "Instrument-Sans-OFL.txt"),
            1_000L
        )
        download(
            "https://raw.githubusercontent.com/ateliertriay/bricolage/84745e5b96261ae5f8c6c856e262fe78d1d6efdd/OFL.txt",
            File(licenseDirectory, "Bricolage-Grotesque-OFL.txt"),
            1_000L
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

val fetchAharaneFonts = tasks.register<FetchAharaneFontsTask>("fetchAharaneFonts") {
    androidResourceDirectory.set(layout.buildDirectory.dir("generated/aharane-font-res"))
    licenseAssetDirectory.set(layout.buildDirectory.dir("generated/aharane-font-assets"))
    pinnedFontRevisions.set("instrument-sans@7fa22308;bricolage-grotesque@84745e5b")
}

// Register generated resources using the AGP Variant API. AGP 9 disallows
// Provider-backed directories on the legacy SourceSet API.
androidComponents {
    onVariants(selector().all()) { variant ->
        variant.sources.res?.addGeneratedSourceDirectory(
            fetchAharaneFonts,
            FetchAharaneFontsTask::androidResourceDirectory
        )
        variant.sources.assets?.addGeneratedSourceDirectory(
            fetchAharaneFonts,
            FetchAharaneFontsTask::licenseAssetDirectory
        )
    }
}

ksp {
    arg("room.schemaLocation", "$projectDir/schemas")
}

dependencies {
    implementation(libs.androidx.activity.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.icons)
    implementation(libs.room.runtime)
    implementation(libs.room.ktx)
    implementation(libs.androidx.sqlite)
    implementation(libs.sqlcipher)
    ksp(libs.room.compiler)
    testImplementation(libs.junit)
    testImplementation(libs.room.testing)
    androidTestImplementation(libs.androidx.test.junit)
    androidTestImplementation(libs.androidx.test.runner)
}
