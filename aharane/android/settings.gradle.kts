pluginManagement {
    repositories {
        google()
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
