pluginManagement {
    repositories {
        google()
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
        mavenCentral()
    }
}
rootProject.name = "Aharane-Android"
include(":app")
