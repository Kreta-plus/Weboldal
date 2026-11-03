plugins {
    alias(libs.plugins.android.application)
}

android {
    namespace = "hu.zsirkreta.app"
    compileSdk {
        version = release(37)
    }

    defaultConfig {
        applicationId = "hu.zsirkreta.app"
        minSdk = 26
        targetSdk = 37
        versionCode = 2
        versionName = "2.0"
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
