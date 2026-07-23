// Fullscreen to New Desktop — KWin 6 (Plasma 6) script
// Moves a window to its own freshly-created virtual desktop when it becomes
// fullscreen or maximized (macOS Spaces style), and removes that desktop when
// the window leaves that state or is closed.

const DEBUG = false;
function log(msg) { if (DEBUG) print("[fs2desktop] " + msg); }

// Run `fn` with the "slide" desktop-switch animation temporarily disabled, so the
// automatic hop onto (or off) a Space is instant instead of a visible slide — which
// otherwise flashes the wallpaper/background through a transparent fullscreen window.
// `fn` runs inside the DBus reply callback, i.e. once the effect is actually
// unloaded, then the effect is restored so your MANUAL switches keep animating.
//
// This is async. For a normal fullscreen enter/exit there are no competing events,
// so nothing interleaves. During a game's brief fullscreen flicker the callbacks can
// overlap, but moveToNewDesktop() returns early when already managed and the id-based
// bookkeeping keeps state correct, so it settles cleanly. runNoSlide runs about once
// per enter and once per exit — no effect thrashing.
function runNoSlide(fn) {
    callDBus("org.kde.KWin", "/Effects", "org.kde.kwin.Effects",
             "unloadEffect", "slide", function () {
        fn();
        callDBus("org.kde.KWin", "/Effects", "org.kde.kwin.Effects",
                 "loadEffect", "slide");
    });
}

// internalId -> { tempDesktopId, savedDesktopIds, reason, app }
// We store desktop *ids* (stable strings), never VirtualDesktop wrappers, which go
// stale as desktops are created/removed and would make later switches silently fail.
const state = {};

// Stable per-application key. Games launched via Steam/Proton (e.g. Hunt: Showdown)
// spawn several top-level windows at startup — an EasyAntiCheat launcher, a
// transient loading surface, the real game window — and more than one of them
// goes fullscreen. Grouping by app lets them all share ONE dedicated desktop
// instead of each spawning its own, which is what left a stray empty Space behind.
function appKey(w) {
    return (w.resourceClass || w.resourceName || "") + "|" + (w.pid || 0);
}

// If another managed fullscreen window from the same app already has a dedicated
// desktop, return its id so the new window joins it instead of creating a second one.
function existingDesktopForApp(w) {
    const app = appKey(w);
    for (const key in state) {
        if (state[key].app === app) return state[key].tempDesktopId;
    }
    return null;
}

// Full geometry of the screen (output) the window is on — the whole screen,
// panels included, NOT the maximize/work area. A borderless "fullscreen windowed"
// game (e.g. Hunt: Showdown) matches this exactly even though KWin reports it as
// merely maximized rather than fullScreen.
function screenGeometry(w) {
    if (w.output && w.output.geometry) return w.output.geometry;
    return workspace.clientArea(KWin.FullScreenArea, w);
}

// A window "covers the screen" when its frame geometry equals the screen geometry.
// This is the trigger the user wants: same size as the screen -> own Space. It
// catches true fullscreen, borderless-windowed games, and any window sized to the
// full output, while leaving a normally-maximized window (which stops at the panel)
// alone.
function coversScreen(w) {
    const g = w.frameGeometry, s = screenGeometry(w);
    if (!g || !s) return false;
    const t = 1; // 1px tolerance for rounding
    return Math.abs(g.x - s.x) <= t && Math.abs(g.y - s.y) <= t
        && Math.abs(g.width - s.width) <= t && Math.abs(g.height - s.height) <= t;
}

function shouldManage(w) {
    // Only real application windows. Skip desktop/dock/OSD/panels. NOTE: do NOT
    // require w.moveable — a fullscreen window reports moveable=false, yet that is
    // exactly the window we need to move to its own desktop. (moveable refers to
    // interactive dragging, not to virtual-desktop assignment.)
    if (!w || !w.normalWindow) return false;
    if (w.desktopWindow || w.dock || w.splash || w.utility) return false;
    // Skip special/overlay surfaces: OSDs, notifications, tooltips, popups.
    if (w.onScreenDisplay || w.notification || w.criticalNotification
        || w.tooltip || w.popupWindow) return false;
    // Full-screen overlays from tiling helpers (e.g. KZones' "KZones Overlay",
    // shown while dragging a window) cover the whole screen but are NOT real app
    // windows — they skip the taskbar, pager AND switcher. A genuine fullscreen
    // game or browser stays present in the taskbar, so this never excludes those.
    if (w.skipTaskbar && w.skipPager && w.skipSwitcher) return false;
    return true;
}

function desktopIndexById(id) {
    const list = workspace.desktops;
    for (let i = 0; i < list.length; i++) {
        if (list[i].id === id) return i;
    }
    return -1;
}

// Resolve a desktop id to a FRESH VirtualDesktop object (or null if it's gone).
// Always re-resolve right before use — never reuse a stored wrapper.
function desktopById(id) {
    const i = desktopIndexById(id);
    return i >= 0 ? workspace.desktops[i] : null;
}

// The window's current desktops as REAL (non-temp) base ids. If the window sits on
// one of our temp desktops (e.g. a second app window born there), substitute that
// temp desktop's own saved base — so we never record a temp desktop as a window's
// home, which would strand it there on un-fullscreen. Reads w.desktops fresh and
// builds a new array, so there's no live-reference aliasing to worry about.
function realBaseIds(w) {
    const tempBase = {};
    for (const k in state) tempBase[state[k].tempDesktopId] = state[k].savedDesktopIds;
    const out = [];
    w.desktops.forEach(function (d) {
        const sub = (tempBase[d.id] && tempBase[d.id].length) ? tempBase[d.id] : [d.id];
        sub.forEach(function (id) { if (out.indexOf(id) === -1) out.push(id); });
    });
    return out;
}

function moveToNewDesktop(w, reason) {
    const key = w.internalId;
    if (state[key]) return; // already managed — don't create a second desktop

    const savedIds = realBaseIds(w);          // real home desktop ids (empty = "all")

    // If another window of the same app already owns a dedicated desktop, join it
    // instead of creating a second Space (see appKey). When it later leaves
    // fullscreen, desktopStillUsed keeps the desktop alive until the last sharer
    // is gone, so cleanup stays correct.
    const sharedId = existingDesktopForApp(w);
    let dt = sharedId ? desktopById(sharedId) : null;
    if (dt) {
        log("joining existing desktop for app '" + (w.resourceClass || w.caption) + "'");
    } else {
        // Insert the new desktop immediately AFTER the window's current desktop
        // (macOS-style: the Space appears right next to the current one), not at the end.
        const base = savedIds.length > 0 ? desktopById(savedIds[0]) : workspace.currentDesktop;
        const idx = base ? desktopIndexById(base.id) : -1;
        const insertPos = idx >= 0 ? idx + 1 : workspace.desktops.length;
        workspace.createDesktop(insertPos, w.caption || "Fullscreen");
        dt = workspace.desktops[insertPos];
    }
    state[key] = { tempDesktopId: dt.id, savedDesktopIds: savedIds, reason: reason, app: appKey(w) };
    // Move the window to the new desktop AND make that desktop current together, so
    // the window is never briefly on a non-current desktop — otherwise Chromium/Brave
    // detect the visibility change and drop out of fullscreen the instant we move
    // them. Un-animated so the Space appears instantly, no slide.
    runNoSlide(function () {
        w.desktops = [dt];
        workspace.currentDesktop = dt;
    });
    log("moved '" + w.caption + "' to desktop " + dt.id + " (" + reason
        + "), saved=[" + savedIds.join(",") + "]");
}

function desktopStillUsed(dtId, exceptInternalId) {
    // Compare by stable id — VirtualDesktop wrappers are not identity-stable
    // across separate property reads, so `===` on the objects is unreliable.
    // exceptInternalId lets the caller ignore the window that is leaving: on close
    // it may still linger in stackingOrder on the temp desktop, which would falsely
    // keep the (now empty) desktop alive.
    const except = exceptInternalId != null ? "" + exceptInternalId : null;
    return workspace.stackingOrder.some(function (o) {
        if (except !== null && ("" + o.internalId) === except) return false;
        return o.desktops.some(function (d) { return d.id === dtId; });
    });
}

function moveBack(w) {
    if (!w) return;
    const key = w.internalId;
    const s = state[key];
    if (!s) return;
    delete state[key];

    // Re-resolve the saved desktops to FRESH objects by id. The wrappers captured
    // at move time go stale once desktops are created/removed, and assigning stale
    // wrappers (or switching to one) silently no-ops — which is what stranded the
    // window on the temp Space instead of sending it back where it came from.
    const freshSaved = s.savedDesktopIds.map(desktopById).filter(Boolean);
    w.desktops = freshSaved;            // empty array => "on all desktops" (sync: off temp first)
    const target = freshSaved.length > 0 ? freshSaved[0] : workspace.desktops[0];
    log("moveBack '" + w.caption + "' -> " + (target && target.id)
        + " (saved=[" + s.savedDesktopIds.join(",") + "])");
    // Switch back un-animated (no slide), then — still inside the callback, after the
    // window is off the temp desktop — remove it if nothing else is left on it.
    runNoSlide(function () {
        workspace.currentDesktop = target;
        if (!desktopStillUsed(s.tempDesktopId, key)) {
            const dt = desktopById(s.tempDesktopId);
            if (dt) {
                workspace.removeDesktop(dt);
                log("removed temp desktop " + s.tempDesktopId + " for '" + w.caption + "'");
            }
        }
    });
}

// A window earns its own Space if KWin flags it fullscreen (real exclusive
// fullscreen — true at ANY resolution, even a game set below native res), OR if it
// is sized to the whole screen (borderless "fullscreen windowed" games, which KWin
// reports only as maximized). A normally-maximized window is neither.
function isActive(w) { return w.fullScreen || coversScreen(w); }

// React immediately in BOTH directions — no debounce. Entering must be instant and
// un-animated (see runNoSlide) so there's no visible slide/delay; leaving must be
// instant too, otherwise the window lingers on its Space for a beat before snapping
// back, which reads as a flicker. Games flicking fullscreen off/on for a few frames
// (e.g. changing resolution) may briefly create+remove a desktop, but the id-based
// bookkeeping, realBaseIds() and the self-excluding desktopStillUsed() keep the
// final state correct (one Space, no orphans).
function react(w) {
    if (!shouldManage(w)) return;
    // Don't react mid-drag/resize: the geometry is transient and would flip the
    // window onto a new desktop while the user is still sizing it.
    if (w.move || w.resize) return;
    const managed = !!state[w.internalId];
    const active = isActive(w);
    if (DEBUG) log("react '" + w.caption + "' fs=" + w.fullScreen + " max=" + w.maximizeMode
        + " covers=" + coversScreen(w) + " active=" + active + " managed=" + managed);
    if (active && !managed) {
        moveToNewDesktop(w, w.fullScreen ? "fullscreen" : "screen-sized");
    } else if (!active && managed) {
        moveBack(w);
    }
}

function attach(w) {
    if (!shouldManage(w)) return;
    // Only react to real state changes (fullscreen / maximize). We deliberately do
    // NOT listen to frameGeometryChanged — it fires on every drag/resize and would
    // fling ordinary windows onto new desktops. Borderless "fullscreen" games still
    // flip KWin's maximize/fullscreen state, so these two signals are enough; the
    // coversScreen() check in react() then confirms it's actually screen-sized.
    w.fullScreenChanged.connect(function () { react(w); });
    w.maximizedChanged.connect(function () { react(w); });
}

// Keep a dedicated fullscreen desktop pure: independent new windows opened while
// on it get sent to the fullscreen window's original desktop (macOS-style). Child
// windows (dialogs, pickers, popups) of the app stay with it on the fullscreen desktop.
function baseDesktopsFor(s) {
    const fresh = s.savedDesktopIds.map(desktopById).filter(Boolean);
    return fresh.length > 0 ? fresh : [workspace.desktops[0]];
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
        const onThisTemp = wd.some(function (d) { return d.id === s.tempDesktopId; });
        if (onThisTemp) {
            const base = baseDesktopsFor(s);
            w.desktops = base;
            // Follow the window: switch to the base desktop and focus it, so the
            // user lands on the new window instead of staying on the fullscreen one.
            workspace.currentDesktop = base[0];
            workspace.activeWindow = w;
            log("redirected + followed new window '" + w.caption + "' off the dedicated desktop");
            return;
        }
    }
}

function onWindowAdded(w) {
    attach(w);                 // watch for it going fullscreen/maximized
    react(w);                  // catch windows that are BORN fullscreen/maximized (e.g. Chromium spawns a new fullscreen surface)
    redirectIfOnDedicated(w);  // ...or if it just spawned on a fullscreen desktop, move it away
}

// Existing windows
workspace.stackingOrder.forEach(attach);
// New windows
workspace.windowAdded.connect(onWindowAdded);
// Cleanup on close (window may vanish while on its temp desktop).
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
