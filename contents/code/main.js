// Fullscreen to New Desktop — KWin 6 (Plasma 6) script
// Moves a window to its own freshly-created virtual desktop when it becomes
// fullscreen or maximized (macOS Spaces style), and removes that desktop when
// the window leaves that state or is closed.

const DEBUG = false;
function log(msg) { if (DEBUG) print("[fs2desktop] " + msg); }

// Run `fn` with the "slide" desktop-switch animation temporarily disabled, then
// restore it so manual desktop switches keep animating as usual. `fn` runs inside
// the callback, so any desktop moves/switches it does happen together (atomically)
// while un-animated.
function runNoSlide(fn) {
    callDBus("org.kde.KWin", "/Effects", "org.kde.kwin.Effects",
             "unloadEffect", "slide", function () {
        fn();
        callDBus("org.kde.KWin", "/Effects", "org.kde.kwin.Effects",
                 "loadEffect", "slide");
    });
}

function switchDesktopNoAnim(dt, after) {
    runNoSlide(function () {
        workspace.currentDesktop = dt;
        if (after) after();
    });
}

// internalId -> { tempDesktop, savedDesktops, reason }
const state = {};

// Real maximize state (MaximizeFull === 3). Accurate — unlike a geometry check it
// won't confuse a borderless/full-screen-sized window for a maximized one.
function isMaximized(w) {
    return w.maximizeMode === 3;
}

function shouldManage(w) {
    // Only real application windows. Skip desktop/dock/OSD/panels. NOTE: do NOT
    // require w.moveable — a fullscreen window reports moveable=false, yet that is
    // exactly the window we need to move to its own desktop. (moveable refers to
    // interactive dragging, not to virtual-desktop assignment.)
    return !!w && w.normalWindow
        && !w.desktopWindow && !w.dock && !w.splash && !w.utility;
}

function desktopIndexById(id) {
    const list = workspace.desktops;
    for (let i = 0; i < list.length; i++) {
        if (list[i].id === id) return i;
    }
    return -1;
}

function moveToNewDesktop(w, reason) {
    const key = w.internalId;
    if (state[key]) return; // already managed — don't create a second desktop

    // IMPORTANT: copy the array. w.desktops may return a live reference that
    // would get mutated when we reassign w.desktops below, corrupting the saved
    // value and breaking both the restore and the desktop cleanup.
    const saved = w.desktops.slice();         // array of VirtualDesktop (empty = "all")

    // Insert the new desktop immediately AFTER the window's current desktop
    // (macOS-style: the Space appears right next to the current one), not at the end.
    const base = saved.length > 0 ? saved[0] : workspace.currentDesktop;
    const idx = desktopIndexById(base.id);
    const insertPos = idx >= 0 ? idx + 1 : workspace.desktops.length;
    workspace.createDesktop(insertPos, w.caption || "Fullscreen");
    const dt = workspace.desktops[insertPos];
    state[key] = { tempDesktop: dt, savedDesktops: saved, reason: reason };
    // Move the window to the new desktop AND make that desktop current in the SAME
    // synchronous block, so the window is never briefly on a non-current desktop.
    // Otherwise Chromium/Brave detect the visibility change and drop out of
    // fullscreen the instant we move them, which would immediately undo everything.
    runNoSlide(function () {
        w.desktops = [dt];
        workspace.currentDesktop = dt;
    });
    log("moved '" + w.caption + "' to new desktop (" + reason + ")");
}

function desktopStillUsed(dt) {
    // Compare by stable id — VirtualDesktop wrappers are not identity-stable
    // across separate property reads, so `===` on the objects is unreliable.
    return workspace.stackingOrder.some(function (o) {
        return o.desktops.some(function (d) { return d.id === dt.id; });
    });
}

function moveBack(w) {
    if (!w) return;
    const key = w.internalId;
    const s = state[key];
    if (!s) return;
    delete state[key];

    w.desktops = s.savedDesktops;
    const target = s.savedDesktops.length > 0
        ? s.savedDesktops[0]
        : workspace.desktops[0];
    // Switch back un-animated, then (still inside the callback, after the switch
    // committed) remove the now-empty temp desktop so KWin doesn't fall back to
    // an animated switch of its own.
    switchDesktopNoAnim(target, function () {
        if (!desktopStillUsed(s.tempDesktop)) {
            workspace.removeDesktop(s.tempDesktop);
            log("removed temp desktop for '" + w.caption + "'");
        }
    });
}

function evaluate(w) {
    if (!shouldManage(w)) return;
    const active = w.fullScreen || isMaximized(w);
    const managed = !!state[w.internalId];
    if (active && !managed) {
        moveToNewDesktop(w, w.fullScreen ? "fullscreen" : "maximize");
    } else if (!active && managed) {
        moveBack(w);
    }
}

function attach(w) {
    if (!shouldManage(w)) return;
    w.fullScreenChanged.connect(function () { evaluate(w); });
    w.maximizedChanged.connect(function () { evaluate(w); });
}

// Keep a dedicated fullscreen desktop pure: independent new windows opened while
// on it get sent to the fullscreen window's original desktop (macOS-style). Child
// windows (dialogs, pickers, popups) of the app stay with it on the fullscreen desktop.
function baseDesktopsFor(s) {
    return s.savedDesktops.length > 0 ? s.savedDesktops : [workspace.desktops[0]];
}

function redirectIfOnDedicated(w) {
    if (!w) return;
    if (state["" + w.internalId]) return;          // this window is itself a managed fullscreen window
    if (!w.normalWindow) return;                   // dialogs / utility / splash stay put
    if (w.transient || w.transientFor) return;     // child windows stay with their parent
    if (!w.moveable) return;

    const wd = w.desktops;
    if (wd.length === 0) return;                   // on all desktops — leave it
    for (const key in state) {
        const s = state[key];
        const onThisTemp = wd.some(function (d) { return d.id === s.tempDesktop.id; });
        if (onThisTemp) {
            const base = baseDesktopsFor(s);
            w.desktops = base;
            // Follow the window: switch to the base desktop and focus it, so the
            // user lands on the new window instead of staying on the fullscreen one.
            switchDesktopNoAnim(base[0], function () {
                workspace.activeWindow = w;
            });
            log("redirected + followed new window '" + w.caption + "' off the dedicated desktop");
            return;
        }
    }
}

function onWindowAdded(w) {
    attach(w);                 // watch for it going fullscreen/maximized
    evaluate(w);               // catch windows that are BORN fullscreen/maximized (e.g. Chromium spawns a new fullscreen surface)
    redirectIfOnDedicated(w);  // ...or if it just spawned on a fullscreen desktop, move it away
}

// Existing windows
workspace.stackingOrder.forEach(attach);
// New windows
workspace.windowAdded.connect(onWindowAdded);
// Cleanup on close (window may vanish while on its temp desktop)
workspace.windowRemoved.connect(function (w) { moveBack(w); });

// Global shortcut: toggle fullscreen on the active window (rest happens via handler).
// Reconfigurable in System Settings -> Shortcuts -> KWin.
registerShortcut(
    "Toggle Fullscreen New Desktop",
    "Fullscreen active window on a new desktop",
    "Meta+F",
    function () {
        const w = workspace.activeWindow;
        if (w && shouldManage(w)) {
            w.fullScreen = !w.fullScreen;
        }
    }
);

log("loaded");
