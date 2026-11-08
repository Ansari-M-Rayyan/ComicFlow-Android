# ComicFlow Mobile

**Your comic library, right in your pocket.**

ComicFlow Mobile brings the ComicFlow reading experience to Android phones and tablets. It's built with touchscreens in mind, making it easy to browse and enjoy your comics wherever you are.

The idea is simple: provide a clean, comfortable reading experience without unnecessary distractions. No ads, no tracking, no online accounts, and no internet connection required. Your comics stay on your device, where they belong.

> [!WARNING]
> **ComicFlow Mobile is currently in Beta.**
>
> The Android version is still under active development, so you might come across a few minor bugs or unexpected behavior while using the app. I'm continuously working on improving things, and feedback is always welcome.
>
> If you're interested in the project, feel free to explore the source code, report issues, or contribute to its development. Every contribution helps!

## ✨ Features

- **Smooth Gesture Controls:** Navigate through pages with simple swipes, zoom in with a double tap, and adjust the view using pinch-to-zoom.
- **Flexible Reading Layouts:** Switch between Single-Page, Dual-Page Landscape, and Continuous Vertical Scroll (Webtoon-style) layouts.
- **Direct Storage Access:** Open comics directly from your phone's internal storage or microSD card without having to copy files into a separate app folder.
- **Smart Library Management:** Automatically generate thumbnails for `.cbz` and `.cbr` archives, search your collection, and keep track of your reading progress.
- **Lightweight & Battery Friendly:** No background network syncing, unnecessary analytics, or banner ads.

## 📚 Supported Formats

ComicFlow Mobile supports the following formats:

- `.cbz` - ZIP-compressed comic archives.
- `.cbr` - RAR-compressed comic archives.

## 📲 Download & Installation

### Install Using the APK

Getting started is straightforward:

1. Head over to the [**GitHub Releases**](https://github.com/Ansari-M-Rayyan/ComicFlow-Android/releases) page.
2. Download the latest APK file (for example, `ComicFlow(Beta).apk`).
3. Open the downloaded APK on your Android device.
4. If Android asks for permission, allow installation from unknown sources for your browser or file manager.
5. Launch ComicFlow and select the folder containing your comic collection.

That's it! You're ready to start reading.

## 🖥️ Looking for the Windows Version?

If you'd prefer a more stable experience, check out **[ComicFlow Desktop](https://github.com/Ansari-M-Rayyan/ComicFlow-Desktop)**, the Windows version of the project.

It follows the same philosophy: a clean, distraction-free comic reading experience that keeps your library private and local.

- **Platform:** Windows
- **Status:** Stable
- **Source Code:** [ComicFlow Desktop Repository](https://github.com/Ansari-M-Rayyan/ComicFlow-Desktop)
- **Download:** [Get the latest Windows release](https://github.com/Ansari-M-Rayyan/ComicFlow-Desktop/releases)

## 🔐 Required Permissions

ComicFlow only requests the storage permissions it needs to access and display your local comic collection.

| Permission | Purpose |
|---|---|
| `READ_EXTERNAL_STORAGE` / `READ_MEDIA_IMAGES` | Allows the app to discover and display supported comic files and images on your device. |
| `MANAGE_EXTERNAL_STORAGE` *(optional, Android-version dependent)* | May be used to access comic files directly from storage locations that require broader file access on supported Android versions. |

**Privacy note:** ComicFlow is designed to work entirely offline. It does not require internet access to load or read your local comic collection.

## 🛠️ Building from Source

Want to build ComicFlow Mobile yourself or make changes to the project? Here's how to get started.

### Prerequisites

Make sure you have the following installed:

- [Node.js](https://nodejs.org/) (v18 or later)
- [Android Studio](https://developer.android.com/studio) with the Android SDK (API Level 26 or higher)
- Java Development Kit (JDK 17 recommended)
- Android NDK and CMake (if required by the native archive extraction modules)

### Getting Started

**1. Clone the repository**

```bash
git clone https://github.com/Ansari-M-Rayyan/ComicFlow-Android.git
cd ComicFlow-Android
```

**2. Install dependencies**

```bash
pnpm install
```

**3. Build the Debug APK**

Depending on your build setup, use the appropriate command:

```bash
# Using the Gradle wrapper
./gradlew assembleDebug
```

Or, if building through Tauri Mobile:

```bash
pnpm tauri android build --debug
```

**4. Locate the generated APK**

For the Gradle debug build, the APK will be available at:

```text
android/app/build/outputs/apk/debug/
```

## ⚖️ Legal Notice

ComicFlow Mobile is an offline comic reader and library organizer. It is not a platform for distributing copyrighted content.

- It does not host, stream, scrape, distribute, or download copyrighted comic books or other digital media.
- Users are responsible for obtaining their reading materials legally and ensuring they have the necessary rights to store and access those files.
- All comic files are opened directly from the user's own device.

## ❤️ Support & Contributions

ComicFlow Mobile is an independently developed project, and it's still a work in progress.

If you enjoy the idea behind it and would like to help make it better, you're more than welcome to contribute.

Whether it's fixing a bug, improving the UI, suggesting a new feature, or simply reporting an issue, every bit of help is appreciated.

You don't have to be an experienced developer to support the project. Even sharing feedback about your experience using the app makes a difference.

If you'd like to contribute, feel free to check out the repository, explore the code, and open a pull request.

Thanks for checking out ComicFlow and being part of its journey!

## 👨‍💻 Author & Credits

**Rayyan Ansari**

Designed and developed with care.

- GitHub: [@Ansari-M-Rayyan](https://github.com/Ansari-M-Rayyan)

Built for comic readers everywhere who appreciate a simple reading experience, privacy, and a little less clutter.

---

If you enjoy using ComicFlow Mobile, consider leaving the repository a ⭐ on GitHub. It really helps the project reach more people!
