# store.kde.org — Add Product (copy-paste)

**Product Name**
Fullscreen to New Desktop

**Category** (tastează "kwin" în căutare)
Plasma 6 → KWin Scripts

**Version**
1.5.0

**Link to Source/Code**
https://github.com/geodro/kde-fullscreen-spaces

**Product Original or Modification**
Original

**License**
MIT

**Credit (CC-BY only)**
— lasă gol

**Tags**
kwin, kwin-script, virtual-desktops, fullscreen, macos, spaces, plasma6, wayland, gaming

**Product Logo**
PNG 256x256 sau 512x512 (vezi NEXT)

---

## Product Description

macOS-style fullscreen Spaces for KDE Plasma 6.

Fullscreen a window — or let a borderless game fill the screen — and it glides onto its own virtual desktop, created right next to the one you were on. Leave fullscreen and that desktop vanishes, dropping you back exactly where you started. Just like macOS.

What it does:

• Fullscreen → own Space. Any window that goes truly fullscreen (a video, a game, a presentation, at any resolution) is moved to a brand-new virtual desktop created immediately after your current one.
• Borderless games too. A window sized exactly to the screen ("fullscreen windowed") gets its own Space. A normally maximized window — which stops at your panel — is deliberately left alone.
• Game-aware. All windows of one app (e.g. an anti-cheat launcher plus the game) share a single Space, and the flicker games produce while changing resolution settles cleanly to one Space.
• Auto-cleanup. Exit fullscreen or close the window and the temporary desktop is removed. You never accumulate stray desktops.
• Named after the window. The Space is titled "⛶ <window title>" and keeps up with it — switch tab or start another video and the pager follows.
• Survives a reload. After a crash or re-install, a still-fullscreen window is re-adopted and abandoned Spaces are cleaned up.
• Drag it out. Grab a window that's on a Space and the Space is released right away, even if the window is still screen-sized.
• The Space stays pure. Open a window from another app while in a fullscreen Space and it's sent back to the previous desktop, and you follow it there — exactly the macOS behaviour.
• Picture-in-Picture friendly. Windows belonging to the app that owns the Space (a browser's PiP window, a second window of the same app) stay on it, matched by class or pid.
• Overlay-proof. OSDs, notifications and tiling-helper overlays (e.g. KZones) never trigger anything.
• Screenshot-safe. Spectacle, Flameshot, ksnip, portal pickers and the lock screen are excluded by name — add your own in the settings, no code editing.
• One shortcut. Meta+F toggles fullscreen-to-a-new-desktop for the active window. Fully rebindable.
• Settings, not source edits. Exclusions, the borderless-game trigger and debug logging live in a proper config page in System Settings.

Tested on Plasma 6 under Wayland, compatible with X11.

Install: System Settings → Window Management → KWin Scripts → Get New Scripts, or download the .kwinscript file and use "Install from File".

Source, issues and documentation: https://github.com/geodro/kde-fullscreen-spaces

**Live:** https://store.kde.org/p/2368744/ (categoryId 720)
