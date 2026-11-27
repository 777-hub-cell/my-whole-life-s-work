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
        maven { url = uri("https://repo1.maven.org/maven2") }
        // Mirror before canonical Central, to withstand HTTP 429 throttling.
        maven { url = uri("https://maven-central.storage-download.googleapis.com/maven2/") }
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        // Fallback endpoint for Maven Central when repo.maven.apache.org is unavailable.
        maven {
            url = uri("https://repo1.maven.org/maven2")
            content {
                includeGroup("junit")
                includeGroup("org.hamcrest")
            }
        }
        // Mirror before canonical Central, to withstand HTTP 429 throttling.
        maven { url = uri("https://maven-central.storage-download.googleapis.com/maven2/") }
        mavenCentral()
    }
}
rootProject.name = "Aharane-Android"
include(":app")
