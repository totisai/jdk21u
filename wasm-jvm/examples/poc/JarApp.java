import java.awt.*;
import java.awt.event.*;
import java.awt.image.*;
import java.io.*;
import java.lang.reflect.*;
import java.net.*;
import java.nio.file.*;
import java.util.*;
import java.util.jar.*;
import java.util.List;
import javax.swing.JComponent;
import javax.swing.RepaintManager;
import javax.swing.SwingUtilities;

/**
 * Generic Swing/AWT launcher for the wasm JVM. Runs an arbitrary application jar
 * (its manifest Main-Class, or /work/target) and drives it through the browser:
 *
 *   - publisher thread: snapshots every showing java.awt.Window into a single
 *     1024x768 RGBA buffer and writes /work/frame.bin (+ /work/seq) for the page
 *     to blit onto a <canvas>.
 *   - input thread: reads /work/ctrl (lines "seq state a b" from wasmjvm.js) and
 *     posts real MouseEvent/KeyEvent to the EDT so genuine listeners fire.
 *
 * Public API only (no sun.awt) so no --add-exports is required.
 */
public class JarApp {
    static int W = 1024, H = 768;   // set from the (viewport-sized) virtual screen at boot

    public static void main(String[] args) throws Exception {
        System.setProperty("java.awt.headless", "false");
        // The wasm port has no VolatileImage/SurfaceManagerFactory backend, so make
        // Swing's RepaintManager double-buffer into a plain BufferedImage instead
        // (else EDT repaints throw "No SurfaceManagerFactory set").
        System.setProperty("swing.volatileImageBufferEnabled", "false");
        // Apply user-supplied system properties (/work/props: "key=value" per line) BEFORE
        // any app class loads, so launch-sensitive apps see them (e.g. IntelliJ's idea.*
        // paths, java.system.class.loader). Set early -- some props affect classloading.
        applyProps();
        // The page passes the actual browser-viewport size; we paint each Window
        // ourselves into a buffer of this size (bypassing the peer's fixed screen),
        // so the app can fill the whole viewport regardless of the virtual screen.
        Dimension scr = Toolkit.getDefaultToolkit().getScreenSize();
        W = intProp("poc.viewportW", scr.width);
        H = intProp("poc.viewportH", scr.height);
        System.out.println("[JarApp] starting; viewport " + W + "x" + H);

        // Gather every jar reachable from the classpath (single jars, /app/lib, and
        // any selected folder tree under /app/user), plus classpath dirs for loose
        // classes/resources. Resolve a main class from an explicit hint or a manifest.
        List<File> jars = new ArrayList<>();
        List<File> dirs = new ArrayList<>();
        for (String entry : classpathEntries()) {
            File f = new File(entry);
            if (entry.endsWith(".jar") && f.isFile()) jars.add(f);
            else if (f.isDirectory()) { dirs.add(f); collectJars(f, jars, 0); }
        }
        collectJars(new File("/app/lib"), jars, 0);
        dedup(jars);
        System.out.println("[JarApp] " + jars.size() + " jar(s), " + dirs.size() + " dir(s) on classpath");

        String mainClass = readTrim("/work/target");           // explicit override (user-typed)
        if (mainClass == null) mainClass = readTrim("/work/mainclass");
        if (mainClass == null)                                 // else: first jar with an app Main-Class
            for (File j : jars) { if (j.getName().equals("launcher.jar")) continue;
                                  String mc = manifestMain(j);
                                  // skip JDK-internal tool entry points (e.g. bundled nashorn.jar's
                                  // jdk.nashorn.tools.Shell) -- they aren't the application's main.
                                  if (mc != null && !mc.startsWith("jdk.") && !mc.startsWith("sun.")
                                      && !mc.startsWith("com.sun.")) { mainClass = mc; break; } }
        if (mainClass == null) {
            System.out.println("[JarApp] no Main-Class found in any jar. Provide one in the launcher UI.");
            return;
        }
        System.out.println("[JarApp] Main-Class = " + mainClass);

        startRepaintTracking();
        startPublisher();
        startInput();
        startMaximizer();

        // Build an explicit loader over every jar + dir (covers folders whose jars
        // the launcher didn't put on the system classpath), above the system loader.
        Class<?> c;
        try { c = Class.forName(mainClass); }
        catch (ClassNotFoundException | NoClassDefFoundError e) {
            List<URL> urls = new ArrayList<>();
            for (File d : dirs) urls.add(d.toURI().toURL());
            for (File j : jars) urls.add(j.toURI().toURL());
            URLClassLoader cl = new URLClassLoader(urls.toArray(new URL[0]), ClassLoader.getSystemClassLoader());
            Thread.currentThread().setContextClassLoader(cl);
            c = Class.forName(mainClass, true, cl);
        }
        Method m = c.getMethod("main", String[].class);
        String[] appArgs = mainArgs();                         // /work/args: one arg per line
        System.out.println("[JarApp] invoking " + mainClass + ".main(" + appArgs.length + " args)");
        try { m.invoke(null, (Object) appArgs); }
        catch (InvocationTargetException e) {
            Throwable t = e.getCause() != null ? e.getCause() : e;
            System.out.println("[JarApp] app threw " + t); t.printStackTrace(System.out);
        }
        // Keep the process (and the publisher/input threads) alive for the GUI.
        System.out.println("[JarApp] main() returned; GUI stays live");
        Thread.currentThread().join();
    }

    // ---- best-effort: make the app's primary frame fill the viewport ----
    // Runs for the whole session: heavy apps (IRPF, IntelliJ) show their main
    // frame long after an 8s window would have closed, so keep maximizing it once
    // it appears. Each frame is stretched only once (tracked by identity) so we
    // don't fight an app that deliberately sets its own size later.
    static final java.util.Set<Window> maximized =
        java.util.Collections.newSetFromMap(new java.util.WeakHashMap<>());
    static void startMaximizer() {
        Thread t = new Thread(() -> {
            while (true) {
                try {
                    EventQueue.invokeLater(() -> {
                        Frame top = null; int best = -1;
                        for (Window w : Window.getWindows())          // largest showing Frame
                            if (w instanceof Frame f && f.isShowing() && f.getWidth() * f.getHeight() > best) {
                                top = f; best = f.getWidth() * f.getHeight();
                            }
                        if (top != null && !maximized.contains(top)
                                && (top.getWidth() != W || top.getHeight() != H || top.getX() != 0 || top.getY() != 0)) {
                            maximized.add(top);
                            top.setBounds(0, 0, W, H);      // fill the whole viewport
                            top.validate();
                        }
                    });
                } catch (Throwable ig) {}
                try { Thread.sleep(250); } catch (InterruptedException e) { return; }
            }
        }, "wasm-maximizer");
        t.setDaemon(true); t.start();
    }

    // Repaint is expensive (full-window paint + a viewport-sized pixel push on an
    // interpreted worker thread), so only do it when Swing actually invalidates
    // something. A custom RepaintManager flips this flag; input also sets it.
    // Dirty-region tracking: accumulate the union of invalidated rectangles (in shared-
    // buffer coords) so the publisher repaints ONLY what changed, not the whole window --
    // a full interpreted repaint of a big UI (e.g. IRPF) per keystroke is the main source
    // of "remote-desktop" lag. A layout/structure change marks the whole viewport.
    static final Object dlock = new Object();
    static int dx0, dy0, dx1, dy1;         // dirty rect [dx0,dy0)-(dx1,dy1); empty if dx1<=dx0
    static boolean fullDirty = true;
    static void markFull() { synchronized (dlock) { fullDirty = true; } }
    static void markDirty() { markFull(); }
    static void unionDirty(int x, int y, int w, int h) {
        synchronized (dlock) {
            if (fullDirty) return;
            if (dx1 <= dx0) { dx0 = x; dy0 = y; dx1 = x + w; dy1 = y + h; }
            else { if (x < dx0) dx0 = x; if (y < dy0) dy0 = y;
                   if (x + w > dx1) dx1 = x + w; if (y + h > dy1) dy1 = y + h; }
        }
    }
    // Grab + clear the pending dirty rect. Returns null if nothing changed; a full-
    // viewport rect if a structural change (or first frames) forced a full repaint.
    static Rectangle takeDirty() {
        synchronized (dlock) {
            if (fullDirty) { fullDirty = false; dx1 = dx0; return new Rectangle(0, 0, W, H); }
            if (dx1 <= dx0) return null;
            Rectangle r = new Rectangle(dx0, dy0, dx1 - dx0, dy1 - dy0);
            r = r.intersection(new Rectangle(0, 0, W, H));
            dx1 = dx0;
            return (r.width > 0 && r.height > 0) ? r : null;
        }
    }
    // Convert a component-local dirty region to shared-buffer coords (each window is
    // painted at its own getX()/getY()). On any failure, fall back to a full repaint.
    static void trackDirty(JComponent c, int x, int y, int w, int h) {
        try {
            java.awt.Window win = SwingUtilities.getWindowAncestor(c);
            if (win == null) { markFull(); return; }
            java.awt.Point p = SwingUtilities.convertPoint(c, x, y, win);
            unionDirty(win.getX() + p.x, win.getY() + p.y, w, h);
        } catch (Throwable t) { markFull(); }
    }
    static void startRepaintTracking() {
        try {
            RepaintManager rm = new RepaintManager() {
                public void addDirtyRegion(JComponent c, int x, int y, int w, int h) { trackDirty(c, x, y, w, h); super.addDirtyRegion(c, x, y, w, h); }
                public void addInvalidComponent(JComponent c) { markFull(); super.addInvalidComponent(c); }
                public void markCompletelyDirty(JComponent c) { markFull(); super.markCompletelyDirty(c); }
                // The wasm port has no VolatileImage/SurfaceManagerFactory backend;
                // force Swing's offscreen double-buffer to a plain BufferedImage
                // (else EDT repaints throw "No SurfaceManagerFactory set").
                @Override public java.awt.Image getVolatileOffscreenBuffer(Component c, int w, int h) {
                    return getOffscreenBuffer(c, w, h);
                }
            };
            RepaintManager.setCurrentManager(rm);
        } catch (Throwable ignore) {}
    }

    // ---- rendering: snapshot all showing windows into one RGBA frame, on change ----
    // Zero-copy framebuffer: a direct buffer the browser reads straight out of the
    // shared wasm heap. Avoids the per-pixel int->byte RGBA shuffle (~70ms/frame,
    // interpreted) AND the 4 MB MEMFS write+read every frame. Pixels are left in
    // native little-endian int order (0x00RRGGBB -> bytes B,G,R,0); the WebGL
    // shader swizzles .bgr, so no CPU-side channel reordering is needed.
    static java.nio.IntBuffer fbInts;      // int view over the shared pixel buffer
    static java.nio.ByteBuffer sigBuf;     // 4 bytes: the published frame sequence
    static boolean sharedFB = false;

    static long directAddress(java.nio.Buffer b) {
        try {
            java.lang.reflect.Field f = java.nio.Buffer.class.getDeclaredField("address");
            f.setAccessible(true);
            return f.getLong(b);
        } catch (Throwable t) { return 0L; }
    }

    static void startPublisher() {
        final BufferedImage img = new BufferedImage(W, H, BufferedImage.TYPE_INT_RGB);
        final byte[] rgba = new byte[W * H * 4];
        for (int i = 3; i < rgba.length; i += 4) rgba[i] = (byte) 255;
        final boolean profile = Boolean.getBoolean("poc.profile");

        // Canvas2D command pipeline (poc.canvas2d=true): record Java2D primitives into a
        // shared command buffer the page replays onto a 2D canvas context, instead of
        // software-rasterizing into a BufferedImage. cmdSig = [seq:int, length:int].
        java.nio.ByteBuffer cbTmp = null, csTmp = null; Graphics2D mgTmp = null;
        if (Boolean.getBoolean("poc.canvas2d")) {
            try {
                cbTmp = java.nio.ByteBuffer.allocateDirect(16 * 1024 * 1024).order(java.nio.ByteOrder.nativeOrder());
                csTmp = java.nio.ByteBuffer.allocateDirect(8).order(java.nio.ByteOrder.nativeOrder());
                mgTmp = new BufferedImage(4, 4, BufferedImage.TYPE_INT_RGB).createGraphics();
                long cAddr = directAddress(cbTmp), sAddr = directAddress(csTmp);
                if (cAddr != 0 && sAddr != 0) {
                    try (Writer w = new FileWriter("/work/cmdinfo")) { w.write(cAddr + " " + sAddr + " " + W + " " + H); }
                    System.out.println("[JarApp] Canvas2D command pipeline enabled (cmd@" + cAddr + " sig@" + sAddr + ")");
                } else { cbTmp = null; }
            } catch (Throwable t) { System.out.println("[JarApp] Canvas2D unavailable (" + t + "); using raster"); cbTmp = null; }
        }
        final java.nio.ByteBuffer cmdBuf = cbTmp, cmdSig = csTmp;
        final Graphics2D metricsG = mgTmp;

        // Try to set up the shared framebuffer; fall back to the MEMFS path if the
        // buffer address can't be read (e.g. no --add-opens java.base/java.nio).
        try {
            java.nio.ByteBuffer fb = java.nio.ByteBuffer.allocateDirect(W * H * 4)
                    .order(java.nio.ByteOrder.nativeOrder());
            sigBuf = java.nio.ByteBuffer.allocateDirect(4).order(java.nio.ByteOrder.nativeOrder());
            fbInts = fb.asIntBuffer();
            long fbAddr = directAddress(fb), sigAddr = directAddress(sigBuf);
            if (fbAddr != 0 && sigAddr != 0) {
                try (Writer w = new FileWriter("/work/fbinfo")) {
                    w.write(fbAddr + " " + sigAddr + " " + W + " " + H);
                }
                sharedFB = true;
                System.out.println("[JarApp] shared framebuffer enabled (fb@" + fbAddr + " seq@" + sigAddr + ")");
            }
        } catch (Throwable t) {
            System.out.println("[JarApp] shared framebuffer unavailable (" + t + "); using MEMFS frames");
        }
        Thread t = new Thread(() -> {
            long seq = 0; int forced = 0;
            long nPaint = 0, nConv = 0, nWrite = 0, frames = 0;
            while (true) {
                try {
                    Rectangle dr = takeDirty();
                    if (forced < 30) { forced++; dr = new Rectangle(0, 0, W, H); }  // first ~0.5s full (layout/fonts settle)
                    if (dr != null && cmdBuf != null) {
                        // Canvas2D: record vector draw commands (no rasterization here).
                        long t0 = profile ? System.nanoTime() : 0;
                        cmdBuf.clear();
                        cmdBuf.put((byte) 0x03);                 // RESETCLIP: identity xform + clip/clear dirty rect
                        cmdBuf.putInt(dr.x); cmdBuf.putInt(dr.y); cmdBuf.putInt(dr.width); cmdBuf.putInt(dr.height);
                        CmdGraphics2D root = new CmdGraphics2D(cmdBuf, metricsG, dr.x, dr.y, dr.width, dr.height);
                        for (Window w : Window.getWindows()) {
                            if (!w.isShowing() || w.getWidth() <= 0) continue;
                            if (!dr.intersects(new Rectangle(w.getX(), w.getY(), w.getWidth(), w.getHeight()))) continue;
                            Graphics2D gg = (Graphics2D) root.create();
                            gg.translate(w.getX(), w.getY());
                            gg.clipRect(0, 0, w.getWidth(), w.getHeight());
                            try { w.paint(gg); } catch (Throwable ignore) {}
                            gg.dispose();
                        }
                        int len = cmdBuf.position();
                        cmdSig.putInt(4, len); cmdSig.putInt(0, (int) (++seq));  // publish: length then seq
                        if (profile) {
                            long t2 = System.nanoTime(); nPaint += (t2 - t0); frames++;
                            if (frames % 30 == 0)
                                System.out.println("[profile] canvas2d frame " + frames + " avg ms record=" + (nPaint/frames/1_000_000.0) + " bytes=" + len);
                        }
                    } else if (dr != null) {
                        long t0 = profile ? System.nanoTime() : 0;
                        Graphics2D g = img.createGraphics();
                        // Repaint ONLY the dirty rectangle: clip it, clear it, and let Swing
                        // skip components outside the clip. The persistent BufferedImage keeps
                        // last frame's pixels elsewhere, so the full memcpy stays correct.
                        g.setClip(dr.x, dr.y, dr.width, dr.height);
                        g.setColor(new Color(30, 30, 34)); g.fillRect(dr.x, dr.y, dr.width, dr.height);
                        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
                        g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
                        for (Window w : Window.getWindows()) {
                            if (!w.isShowing() || w.getWidth() <= 0) continue;
                            if (!dr.intersects(new Rectangle(w.getX(), w.getY(), w.getWidth(), w.getHeight()))) continue;
                            Graphics2D gg = (Graphics2D) g.create(w.getX(), w.getY(), w.getWidth(), w.getHeight());
                            try { w.paint(gg); } catch (Throwable ignore) {}
                            gg.dispose();
                        }
                        g.dispose();
                        long t1 = profile ? System.nanoTime() : 0;
                        publish(img, rgba, ++seq, profile);
                        if (profile) {
                            long t2 = System.nanoTime();
                            nPaint += (t1 - t0); nConv += convNs; nWrite += (t2 - t1) - convNs; frames++;
                            if (frames % 30 == 0)
                                System.out.println("[profile] frame " + frames + " avg ms  paint=" + (nPaint/frames/1_000_000.0)
                                    + " convert=" + (nConv/frames/1_000_000.0) + " fswrite=" + (nWrite/frames/1_000_000.0));
                        }
                    }
                } catch (Throwable ignore) {}
                try { Thread.sleep(16); } catch (InterruptedException e) { return; }
            }
        }, "wasm-publisher");
        t.setDaemon(true); t.start();
    }

    static volatile long convNs = 0;
    static void publish(BufferedImage img, byte[] rgba, long seq, boolean profile) throws IOException {
        int[] px = ((DataBufferInt) img.getRaster().getDataBuffer()).getData();
        if (sharedFB) {
            // Bulk native memcpy of the pixels into the shared buffer, then bump the
            // frame sequence the browser polls. No per-pixel work, no MEMFS I/O.
            long c0 = profile ? System.nanoTime() : 0;
            fbInts.clear();
            fbInts.put(px);
            sigBuf.putInt(0, (int) seq);
            if (profile) convNs = System.nanoTime() - c0;
            return;
        }
        // Fallback: shuffle to BGRA bytes (matching the shader's .bgr swizzle) and
        // write to MEMFS. Slow (per-pixel, interpreted) -- only used if the shared
        // buffer couldn't be set up.
        long c0 = profile ? System.nanoTime() : 0;
        for (int i = 0, o = 0; i < px.length; i++, o += 4) {
            int v = px[i];
            rgba[o] = (byte) v; rgba[o + 1] = (byte) (v >> 8); rgba[o + 2] = (byte) (v >> 16);
        }
        if (profile) convNs = System.nanoTime() - c0;
        try (OutputStream os = new FileOutputStream("/work/frame.tmp")) { os.write(rgba); }
        new File("/work/frame.tmp").renameTo(new File("/work/frame.bin"));
        try (Writer w = new FileWriter("/work/seq")) { w.write(Long.toString(seq)); }
    }

    // ---- input: real AWT events posted to the EDT ----
    // Preferred path: a lock-free SPSC ring in the shared wasm heap (browser is the
    // single producer, this thread the single consumer). Layout as ints: [0]=head,
    // [1]=tail, [2]=capacity, then `capacity` records of 3 ints (state,a,b). The
    // browser writes a record then Atomics-stores head; we read head with acquire
    // ordering. This removes the per-event MEMFS write+proxy the old /work/ctrl
    // polling incurred, cutting input latency to the (cheap) poll interval.
    static final int CTRL_CAP = 2048;
    static boolean inPressed = false; static int inLastX = 0, inLastY = 0;

    static void dispatchCtrl(int state, int a, int b) {
        switch (state) {
            case 1: inPressed = true; inLastX = a; inLastY = b; postMouse(MouseEvent.MOUSE_PRESSED, a, b, true); break;
            case 2: inLastX = a; inLastY = b; postMouse(MouseEvent.MOUSE_DRAGGED, a, b, inPressed); break;
            case 3: inPressed = false; inLastX = a; inLastY = b;
                    postMouse(MouseEvent.MOUSE_RELEASED, a, b, true);
                    postMouse(MouseEvent.MOUSE_CLICKED, a, b, true); break;
            case 6: inLastX = a; inLastY = b; postMouse(MouseEvent.MOUSE_MOVED, a, b, false); break;
            case 4: postKey(a, b); break;
            case 5: postWheel(inLastX, inLastY, b); break;
        }
        markDirty();   // any input may change the UI; ensure a repaint
    }

    static void startInput() {
        java.nio.ByteBuffer cb = null; java.nio.IntBuffer ci = null;
        java.lang.invoke.VarHandle vh = null;
        try {
            cb = java.nio.ByteBuffer.allocateDirect((3 + CTRL_CAP * 3) * 4).order(java.nio.ByteOrder.nativeOrder());
            ci = cb.asIntBuffer(); ci.put(2, CTRL_CAP);
            vh = java.lang.invoke.MethodHandles.byteBufferViewVarHandle(int[].class, java.nio.ByteOrder.nativeOrder());
            long addr = directAddress(cb);
            if (addr != 0) {
                try (Writer w = new FileWriter("/work/ctrlinfo")) { w.write(addr + " " + CTRL_CAP); }
                System.out.println("[JarApp] shared input ring enabled (@" + addr + ")");
            } else { cb = null; }
        } catch (Throwable t) { cb = null; }

        final java.nio.ByteBuffer ctrl = cb; final java.nio.IntBuffer cints = ci;
        final java.lang.invoke.VarHandle CTRL = vh;
        Thread t = new Thread(() -> {
            if (ctrl != null) {                       // shared-ring consumer
                int tail = 0;
                while (true) {
                    try {
                        int head = (int) CTRL.getAcquire(ctrl, 0);   // byte 0 = head
                        while (tail != head) {
                            int base = 3 + (tail % CTRL_CAP) * 3;
                            dispatchCtrl(cints.get(base), cints.get(base + 1), cints.get(base + 2));
                            tail++;
                        }
                        CTRL.setRelease(ctrl, 4, tail);              // byte 4 = tail
                    } catch (Throwable ignore) {}
                    try { Thread.sleep(3); } catch (InterruptedException e) { return; }
                }
            }
            // Fallback: poll the /work/ctrl text file (per-event MEMFS proxy).
            long off = 0; StringBuilder partial = new StringBuilder();
            while (true) {
                try {
                    java.util.List<String> newLines = new ArrayList<>();
                    try (RandomAccessFile raf = new RandomAccessFile("/work/ctrl", "r")) {
                        long len = raf.length();
                        if (len < off) off = 0;
                        if (len > off) {
                            raf.seek(off);
                            byte[] buf = new byte[(int) (len - off)];
                            raf.readFully(buf); off = len;
                            partial.append(new String(buf));
                            int nl;
                            while ((nl = partial.indexOf("\n")) >= 0) {
                                newLines.add(partial.substring(0, nl));
                                partial.delete(0, nl + 1);
                            }
                        }
                    } catch (IOException e) { Thread.sleep(20); continue; }
                    for (String line : newLines) {
                        line = line.trim(); if (line.isEmpty()) continue;
                        String[] p = line.split("\\s+"); if (p.length < 4) continue;
                        dispatchCtrl(Integer.parseInt(p[1]), Integer.parseInt(p[2]), Integer.parseInt(p[3]));
                    }
                } catch (Throwable ignore) {}
                try { Thread.sleep(15); } catch (InterruptedException e) { return; }
            }
        }, "wasm-input");
        t.setDaemon(true); t.start();
    }

    static Window active() {
        Window best = null;
        for (Window w : Window.getWindows()) if (w.isShowing()) best = w;   // topmost showing
        return best;
    }

    static void postMouse(int id, int sx, int sy, boolean button) {
        Window w = active(); if (w == null) return;
        int lx = sx - w.getX(), ly = sy - w.getY();
        Component target = javax.swing.SwingUtilities.getDeepestComponentAt(w, lx, ly);
        if (target == null) target = w;
        Point pt = javax.swing.SwingUtilities.convertPoint(w, lx, ly, target);
        long when = System.currentTimeMillis();
        int mods = button ? InputEvent.BUTTON1_DOWN_MASK : 0;
        final Component tgt = target;
        MouseEvent me = new MouseEvent(tgt, id, when, mods, pt.x, pt.y, (id == MouseEvent.MOUSE_CLICKED ? 1 : 0),
                                       false, button ? MouseEvent.BUTTON1 : MouseEvent.NOBUTTON);
        EventQueue.invokeLater(() -> tgt.dispatchEvent(me));
    }

    static void postWheel(int sx, int sy, int dy) {
        Window w = active(); if (w == null) return;
        int lx = sx - w.getX(), ly = sy - w.getY();
        Component target = javax.swing.SwingUtilities.getDeepestComponentAt(w, lx, ly);
        if (target == null) target = w;
        Point pt = javax.swing.SwingUtilities.convertPoint(w, lx, ly, target);
        final Component tgt = target;
        int rot = dy > 0 ? 1 : -1;
        MouseWheelEvent we = new MouseWheelEvent(tgt, MouseEvent.MOUSE_WHEEL, System.currentTimeMillis(), 0,
                pt.x, pt.y, 0, false, MouseWheelEvent.WHEEL_UNIT_SCROLL, 3, rot);
        EventQueue.invokeLater(() -> tgt.dispatchEvent(we));
    }

    static void postKey(int keyCode, int charCode) {
        Component fo = KeyboardFocusManager.getCurrentKeyboardFocusManager().getFocusOwner();
        if (fo == null) fo = active();
        if (fo == null) return;
        final Component tgt = fo; final long when = System.currentTimeMillis();
        final char ch = charCode > 0 ? (char) charCode : KeyEvent.CHAR_UNDEFINED;
        final int kc = keyCode > 0 ? keyCode : (charCode > 0 ? Character.toUpperCase((char) charCode) : 0);
        EventQueue.invokeLater(() -> {
            tgt.dispatchEvent(new KeyEvent(tgt, KeyEvent.KEY_PRESSED, when, 0, kc, ch));
            if (charCode > 0)
                tgt.dispatchEvent(new KeyEvent(tgt, KeyEvent.KEY_TYPED, when, 0, KeyEvent.VK_UNDEFINED, ch));
            tgt.dispatchEvent(new KeyEvent(tgt, KeyEvent.KEY_RELEASED, when, 0, kc, ch));
        });
    }

    // ---- helpers ----
    static int intProp(String key, int def) {
        try { String v = System.getProperty(key); if (v != null) return Math.max(64, Math.min(8192, Integer.parseInt(v.trim()))); }
        catch (Exception e) {}
        return def;
    }
    static String readTrim(String path) {
        try { File f = new File(path); if (f.isFile()) return Files.readString(f.toPath()).trim(); } catch (Exception e) {}
        return null;
    }
    // Apply /work/props as system properties. One "key=value" per line; blank lines and
    // lines starting with '#' are ignored. Value may be empty; whitespace around key/'='
    // is trimmed (value keeps its interior spaces). Runs before any app class loads.
    static void applyProps() {
        try {
            File f = new File("/work/props");
            if (!f.isFile()) return;
            int n = 0;
            for (String line : Files.readString(f.toPath()).split("\n")) {
                line = line.strip();
                if (line.isEmpty() || line.charAt(0) == '#') continue;
                int eq = line.indexOf('=');
                if (eq < 0) continue;
                String key = line.substring(0, eq).strip();
                String val = line.substring(eq + 1).strip();
                if (key.isEmpty()) continue;
                System.setProperty(key, val);
                n++;
            }
            System.out.println("[JarApp] applied " + n + " system propert" + (n==1?"y":"ies") + " from /work/props");
        } catch (Exception e) { System.out.println("[JarApp] /work/props read failed: " + e); }
    }
    // Read main() arguments from /work/args -- one argument per line (so args may contain
    // spaces). Returns an empty array if absent/empty.
    static String[] mainArgs() {
        try {
            File f = new File("/work/args");
            if (!f.isFile()) return new String[0];
            List<String> out = new ArrayList<>();
            for (String line : Files.readString(f.toPath()).split("\n")) {
                String a = line.strip();
                if (!a.isEmpty()) out.add(a);
            }
            return out.toArray(new String[0]);
        } catch (Exception e) { return new String[0]; }
    }
    static List<String> classpathEntries() {
        List<String> out = new ArrayList<>();
        // Prefer /work/fullcp: the complete app classpath, read here in full (the C
        // launcher caps -Djava.class.path at ~900 bytes, so an exploded folder's big
        // classpath can't live there — only a short bootstrap does).
        String cp = readTrim("/work/fullcp");
        if (cp == null) cp = readTrim("/work/classpath");
        if (cp != null)
            for (String e : cp.split("[:\n]")) if (!e.isBlank()) out.add(e.trim());
        return out;
    }
    /** Recursively collect *.jar under dir (depth-limited to avoid pathological trees). */
    static void collectJars(File dir, List<File> out, int depth) {
        if (dir == null || !dir.isDirectory() || depth > 8) return;
        File[] fs = dir.listFiles(); if (fs == null) return;
        Arrays.sort(fs);
        for (File f : fs) {
            if (f.isDirectory()) collectJars(f, out, depth + 1);
            else if (f.getName().endsWith(".jar")) out.add(f);
        }
    }
    static void dedup(List<File> jars) {
        LinkedHashSet<String> seen = new LinkedHashSet<>();
        jars.removeIf(f -> !seen.add(f.getAbsolutePath()));
    }
    static String manifestMain(File jar) {
        try (JarFile jf = new JarFile(jar)) {
            Manifest mf = jf.getManifest();
            if (mf != null) { String mc = mf.getMainAttributes().getValue("Main-Class"); if (mc != null) return mc.trim(); }
        } catch (IOException e) {}
        return null;
    }
}
