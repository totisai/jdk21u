import java.awt.*;
import java.awt.image.*;
import java.io.*;
import java.lang.reflect.*;
import java.net.*;
import java.util.*;
import java.util.List;
import java.util.jar.*;

/**
 * "Try to play Minecraft" — an honest experiment on the wasm JVM.
 *
 * Minecraft (this is the 2012 / 1.2.5-era client.jar, Main-Class
 * net.minecraft.client.Minecraft) renders and reads input through LWJGL/OpenGL,
 * not AWT/Java2D. This loads the 4 MB jar into a URLClassLoader, proves the wasm
 * JVM loads and links Minecraft's own bytecode, then shows exactly where it hits
 * the wall (the missing OpenGL stack). The result is painted to the canvas.
 */
public class MCLaunch {
    static final int W = 640, H = 460;
    static final List<String> log = new ArrayList<>();
    static void log(String s) { System.out.println("[mc] " + s); log.add(s); }

    public static void main(String[] args) throws Exception {
        // Make the JVM report an os.name LWJGL recognizes, so its platform
        // detection (LWJGLUtil.<clinit>) picks PLATFORM_LINUX instead of throwing
        // "Unknown platform: Emscripten". No LWJGL fork needed for detection —
        // just report the value it expects, before any LWJGL class initializes.
        String realOs = System.getProperty("os.name");
        System.setProperty("os.name", "Linux");
        log("os.name: '" + realOs + "' -> reporting 'Linux' so LWJGL platform detection passes");
        log("user.home = " + System.getProperty("user.home") + " (persistent if IDBFS-mounted)");

        // Every jar dropped into /app/mc (client.jar, and lwjgl.jar if present)
        File dir = new File("/app/mc");
        File[] jarFiles = dir.listFiles((d, n) -> n.endsWith(".jar"));
        if (jarFiles == null) jarFiles = new File[0];
        Arrays.sort(jarFiles);
        List<URL> urls = new ArrayList<>();
        for (File j : jarFiles) { log("classpath: " + j.getName() + " (" + (j.length()/1024) + " KB)"); urls.add(j.toURI().toURL()); }

        String mainClass = "net.minecraft.client.Minecraft";
        boolean haveLwjgl = false;
        for (File j : jarFiles) if (j.getName().contains("lwjgl")) haveLwjgl = true;
        log("LWJGL jar on classpath: " + haveLwjgl);

        URLClassLoader cl = new URLClassLoader(urls.toArray(new URL[0]), MCLaunch.class.getClassLoader());

        // 1) prove the JVM loads & links Minecraft's own bytecode
        try {
            Class<?> mc = Class.forName(mainClass, false, cl);
            log("loaded " + mc.getName() + " from the jar  ✓");
        } catch (Throwable t) { log("could not load Minecraft class: " + t); }

        // 2) can we load LWJGL's OpenGL binding class, and its NATIVE?
        try {
            Class.forName("org.lwjgl.opengl.Display", false, cl);
            log("org.lwjgl.opengl.Display class loaded  ✓");
            try {   // touching Sys forces System.loadLibrary("lwjgl") -> the native
                Class<?> sys = Class.forName("org.lwjgl.Sys", true, cl);
                sys.getMethod("getVersion").invoke(null);
                log("liblwjgl native loaded ✓ (unexpected on wasm)");
            } catch (Throwable t) {
                Throwable c = (t instanceof InvocationTargetException) ? t.getCause() : t;
                log("liblwjgl NATIVE  →  " + c.getClass().getSimpleName() + ": " + c.getMessage());
            }
        } catch (Throwable t) {
            log("org.lwjgl.opengl.Display  →  " + t.getClass().getSimpleName() + " (add lwjgl.jar)");
        }

        // 3) actually try to run it. Minecraft.main() spawns its own render thread
        // and returns; that thread drives the canvas through LWJGL/WebGL. So if the
        // launch succeeds we must STAY OUT OF THE WAY — do NOT publish our own
        // frames (they'd race Minecraft's on /work/frame.bin and cover the menu).
        // We only draw the diagnostic screen when Minecraft actually fails to start.
        log("invoking " + mainClass + ".main(...) …");
        try {
            Class<?> mc = Class.forName(mainClass, true, cl);
            Method m = mc.getMethod("main", String[].class);
            final Throwable[] caught = new Throwable[1];
            Thread t = new Thread(() -> {
                try { m.invoke(null, (Object) new String[]{}); }
                catch (Throwable ex) { caught[0] = (ex instanceof InvocationTargetException) ? ex.getCause() : ex; }
            }, "minecraft-main");
            t.setDaemon(true);
            t.start(); t.join(4000);
            if (caught[0] != null) {                       // launch threw -> show it
                log("result: " + caught[0]);
                render(caught[0].getClass().getName() + ": " + caught[0].getMessage());
            } else {                                       // launched -> hand over the canvas
                log("Minecraft launched (" + (t.isAlive() ? "booting" : "main returned")
                    + ") — its GL renderer now owns the canvas");
                idle();                                    // keep the JVM alive, publish nothing
            }
        } catch (Throwable ex) {
            log("result: " + ex);
            render(ex.toString());
        }
    }

    // Block forever without touching /work/frame.bin, so Minecraft's own GL frames
    // are the only thing on the canvas. Keeps main() (and thus the JVM) alive.
    static void idle() {
        while (true) { try { Thread.sleep(1000); } catch (InterruptedException e) { return; } }
    }

    static void render(String runResult) throws IOException {
        BufferedImage img = new BufferedImage(W, H, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = img.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
        g.setColor(new Color(24, 26, 30)); g.fillRect(0, 0, W, H);
        g.setColor(new Color(90, 30, 30)); g.fillRect(0, 0, W, 46);
        g.setColor(new Color(230, 180, 180));
        g.setFont(new Font(Font.SANS_SERIF, Font.BOLD, 20));
        g.drawString("Minecraft on WebAssembly — experiment", 16, 30);

        g.setFont(new Font(Font.MONOSPACED, Font.PLAIN, 13));
        int y = 72;
        for (String line : log) {
            g.setColor(line.contains("✓") ? new Color(150, 220, 150)
                      : line.startsWith("result:") || line.contains("→") ? new Color(240, 190, 120)
                      : new Color(200, 205, 215));
            g.drawString(line, 16, y); y += 20;
        }
        y += 8;
        g.setColor(new Color(150, 170, 210));
        g.setFont(new Font(Font.SANS_SERIF, Font.PLAIN, 13));
        for (String s : new String[]{
            "Reporting os.name=Linux at the JVM level gets LWJGL past platform",
            "detection (no fork needed for that). The wall is now LWJGL's native",
            "library — the JNI functions for OpenGL/display/input. We already proved",
            "the JVM can drive WebGL (the GL triangle PoC); implementing LWJGL's GL",
            "natives as the same kind of shims is the next real step, plus an",
            "Emscripten display/input backend. (And Zero has no JIT.)" }) {
            g.drawString(s, 16, y); y += 19;
        }
        g.dispose();

        byte[] rgba = new byte[W * H * 4];
        for (int i = 3; i < rgba.length; i += 4) rgba[i] = (byte) 255;
        int[] px = ((DataBufferInt) img.getRaster().getDataBuffer()).getData();
        for (int i = 0, o = 0; i < px.length; i++, o += 4) { int v = px[i];
            rgba[o] = (byte)(v>>16); rgba[o+1] = (byte)(v>>8); rgba[o+2] = (byte)v; }
        try { new File("/work").mkdirs(); } catch (Throwable t) {}
        for (int f = 0; f < 100000; f++) {   // keep the result on screen
            try (OutputStream os = new FileOutputStream("/work/frame.tmp")) { os.write(rgba); }
            new File("/work/frame.tmp").renameTo(new File("/work/frame.bin"));
            try (Writer w = new FileWriter("/work/seq")) { w.write(Integer.toString(f)); }
            try { Thread.sleep(200); } catch (InterruptedException e) { break; }
        }
    }
}
