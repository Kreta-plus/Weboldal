plugins {
    alias(libs.plugins.android.application)
}

android {
    namespace = "hu.kretaplusz.app"
    compileSdk {
        version = release(37)
    }

    defaultConfig {
        applicationId = "hu.kretaplusz.app"
        minSdk = 26
        targetSdk = 37
        versionCode = 1
        versionName = "1.0"
    }

    buildTypes {
        release {
            optimization {
                enable = false
            }
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation(libs.appcompat)
    implementation(libs.material)
    implementation(libs.swiperefreshlayout)
}
