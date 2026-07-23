<div align="center">

# 🖥️ Fullscreen to New Desktop

### macOS‑style fullscreen **Spaces** for KDE Plasma 6

Fullscreen or maximize a window and it glides onto **its own virtual desktop** — right next to the one you were on. Leave fullscreen and the desktop vanishes, dropping you back exactly where you started. Just like macOS.

![KDE Plasma 6](https://img.shields.io/badge/KDE%20Plasma-6-1d99f3?logo=kde&logoColor=white)
![Wayland](https://img.shields.io/badge/Wayland-tested-2ea043)
![X11](https://img.shields.io/badge/X11-compatible-lightgrey)
![KWin Script](https://img.shields.io/badge/KWin-Script-blueviolet)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow)

</div>

---

## ✨ What it does

- 🎬 **Fullscreen → own Space.** Any window that goes fullscreen (a video, a game, a presentation) is moved to a brand‑new virtual desktop created *immediately after* your current one.
- 🪟 **Maximize too.** Maximizing a window does the same — a dedicated desktop, one app, zero distractions.
- 🧹 **Auto‑cleanup.** Exit fullscreen, un‑maximize, or close the window and its temporary desktop is removed automatically. You never accumulate stray desktops.
- 🎯 **The Space stays pure.** Open a new window while in a fullscreen Space and it's sent back to the previous desktop (and follows you there). The app's own dialogs and pickers stay put — exactly the macOS behavior.
- 🌊 **No jarring animation.** The automatic switch skips the slide effect, so it feels instant. Your *manual* desktop switches keep animating like normal.
- ⌨️ **One shortcut.** `Meta + F` toggles fullscreen‑to‑a‑new‑desktop for the active window. Fully rebindable.

> **Works great with:** YouTube & video fullscreen, exclusive‑fullscreen games, IDEs, PDF/reading, anything you want to focus on.

---

## 🎥 Demo

<!--
  Drop a short screen recording here to really sell it, e.g.:
  ![demo](docs/demo.gif)
-->

```mermaid
flowchart LR
    A["🖥️ Desktop 1<br/>(your work)"] -->|"fullscreen a video"| B["🆕 New Space<br/>video only"]
    B -->|"exit fullscreen"| A2["🖥️ Desktop 1<br/>Space removed ✔"]
    style B fill:#1d99f3,stroke:#0b76c4,color:#fff
    style A fill:#2a2e32,stroke:#444,color:#eee
    style A2 fill:#2a2e32,stroke:#444,color:#eee
```

---

## 🤔 Why?

KDE's virtual desktops are great, but there's no built‑in way to get the thing macOS nails: a fullscreen app becoming its **own** Space, appearing right beside your work and disappearing the moment you're done — no manual desktop juggling.

An older script, [Aetf/kwin‑maxmize‑to‑new‑desktop](https://github.com/Aetf/kwin-maxmize-to-new-desktop), did something similar for **Plasma 5**, but it relies on APIs that were removed in the Plasma 6 rewrite (`client.desktop` integers, `workspace.clientFullScreenSet`, …). This project is a **clean, modern rewrite for Plasma 6 / KWin 6** using the current scripting API (`window.desktops`, `VirtualDesktop` objects, `fullScreenChanged`, `createDesktop`/`removeDesktop`).

---

## 📦 Installation

### Option A — one‑liner (recommended)

```bash
git clone https://github.com/geodro/kde-fullscreen-spaces.git
cd kde-fullscreen-spaces
./install.sh
```

The installer copies the script into place, enables it, and hot‑reloads KWin — no logout needed.

### Option B — with `kpackagetool6`

```bash
git clone https://github.com/geodro/kde-fullscreen-spaces.git
kpackagetool6 --type KWin/Script --install kde-fullscreen-spaces
```

Then enable it in **System Settings → Window Management → KWin Scripts**.

### Enable the shortcut

The default trigger is `Meta + F`. Change it in **System Settings → Keyboard → Shortcuts → KWin** (search for *"Fullscreen active window on a new desktop"*).

---

## ⚙️ Configuration

Everything lives at the top of `contents/code/main.js` (installed to
`~/.local/share/kwin/scripts/fullscreen-to-new-desktop/`). After editing, reload with:

```bash
qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.unloadScript fullscreen-to-new-desktop
qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.loadScript \
  ~/.local/share/kwin/scripts/fullscreen-to-new-desktop/contents/code/main.js fullscreen-to-new-desktop
qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.start
```

**Fullscreen only (truest macOS behavior).** To *not* trigger on maximize, change the trigger in `evaluate()`:

```js
const active = w.fullScreen;              // was: w.fullScreen || isMaximized(w)
```

**Debugging.** Set `const DEBUG = true;` at the top, reload, then watch:

```bash
journalctl --user -f -t kwin_wayland | grep fs2desktop
```

---

## 🧠 How it works

On fullscreen/maximize, the script snapshots the window's current desktop, creates a
new one right after it, and moves the window there — assigning the window **and**
switching to the desktop in the same synchronous step (so browsers don't drop out of
fullscreen from the visibility change). On exit it restores the original desktop and
removes the temporary one if it's empty. The slide effect is briefly unloaded around
each automatic switch so it feels instant, then restored for your manual switches.

---

## 🩹 Troubleshooting

- **Nothing happens.** Make sure the script is enabled (System Settings → KWin Scripts) and try logging out/in once. Confirm with:
  `qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.isScriptLoaded fullscreen-to-new-desktop`
- **A stray desktop was left behind.** This can happen only if you *reload the script while a window is fullscreen* (the in‑memory tracking resets). Normal use cleans up after itself.
- **A borderless‑fullscreen game isn't caught.** Some games use *borderless windowed* mode, which is indistinguishable from an ordinary screen‑filling window and is intentionally not triggered (to avoid false positives). Use the game's exclusive‑fullscreen mode, or maximize it.

---

## 🙏 Credits

Inspired by [Aetf/kwin‑maxmize‑to‑new‑desktop](https://github.com/Aetf/kwin-maxmize-to-new-desktop) (Plasma 5) and, of course, by macOS Spaces.

## 📄 License

[MIT](LICENSE) © George Dumitrescu
