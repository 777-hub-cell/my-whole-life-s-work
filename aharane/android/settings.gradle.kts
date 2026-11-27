pluginManagement {
    // Resolve the KSP plugin directly to its published implementation artifact.
    // This avoids intermittent failure resolving the plugin marker POM while
    // preserving the version pinned in libs.versions.toml.
    resolutionStrategy {
        eachPlugin {
            if (requested.id.id == "com.google.devtools.ksp") {
                useModule("com.google.devtools.ksp:symbol-processing-gradle-plugin:${requested.version}")
            }
        }
    }
    repositories {
        google()
        // Prefer Maven Central's Google-hosted mirror for KSP artifacts.
        maven {
            name = "KspCentralMirror"
            url = uri("https://maven-central.storage-download.googleapis.com/maven2/")
            content {
                includeGroup("com.google.devtools.ksp")
            }
        }
        // Use the Google-hosted Maven Central mirror before canonical Central.
        maven { url = uri("https://maven-central.storage-download.googleapis.com/maven2/") }
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        // Google-hosted Maven Central mirror first; Maven Central is the fallback.
        maven { url = uri("https://maven-central.storage-download.googleapis.com/maven2/") }
        mavenCentral()
    }
}
rootProject.name = "Aharane-Android"
include(":app")
