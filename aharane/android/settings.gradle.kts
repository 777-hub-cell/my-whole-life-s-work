pluginManagement {
    // Resolve the Compose compiler plugin directly to its published implementation
    // artifact. This avoids requiring the separate plugin-marker POM in CI mirrors.
    resolutionStrategy {
        eachPlugin {
            if (requested.id.id == "org.jetbrains.kotlin.plugin.compose") {
                useModule("org.jetbrains.kotlin:compose-compiler-gradle-plugin:${requested.version}")
            }
        }
    }
    repositories {
        google()
        maven { url = uri("https://repo1.maven.org/maven2") }
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
