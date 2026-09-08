import java.io.*;

/**
 * WebGL proof-of-concept on the wasm JVM: draws a spinning triangle through our
 * JNI GL shims (wgl.c → Emscripten GL → WebGL), reads the pixels back, and
 * publishes them to /work/frame.bin so the browser blits them onto the canvas —
 * the same pixel pipeline used by the Java2D demos.
 */
public class GLDemo {
    static final int W = 480, H = 360;
    static native int init(int w, int h, String canvasTarget);
    static native void frame(float angle);
    static native int read(byte[] rgba);   // returns a sample pixel (diagnostics)

    public static void main(String[] args) throws Exception {
        System.loadLibrary("wgl");   // registers the builtin (JNI_OnLoad_wgl)
        System.out.println("[gldemo] loaded wgl; initializing GL " + W + "x" + H);
        int rc = init(W, H, "#glsurface");
        System.out.println("[gldemo] init rc=" + rc);
        if (rc != 0) { System.out.println("[gldemo] no GL context — see [wgl] log above"); publishText(); return; }

        byte[] rgba = new byte[W * H * 4];
        for (int i = 3; i < rgba.length; i += 4) rgba[i] = (byte) 255;
        new File("/work").mkdirs();
        for (long f = 0; ; f++) {
            frame((f * 2.0f) % 360.0f);
            int sample = read(rgba);
            if (f == 0) System.out.println("[gldemo] first frame center pixel=0x" + Integer.toHexString(sample));
            publish(rgba, f);
            Thread.sleep(33);
        }
    }

    static void publish(byte[] rgba, long seq) throws IOException {
        try (OutputStream os = new FileOutputStream("/work/frame.tmp")) { os.write(rgba); }
        new File("/work/frame.tmp").renameTo(new File("/work/frame.bin"));
        try (Writer w = new FileWriter("/work/seq")) { w.write(Long.toString(seq)); }
    }
    static void publishText() throws IOException {
        // solid dark frame so the canvas shows *something* if GL failed
        byte[] rgba = new byte[W * H * 4];
        for (int i = 0; i < rgba.length; i += 4) { rgba[i]=30; rgba[i+1]=20; rgba[i+2]=40; rgba[i+3]=(byte)255; }
        for (long f = 0; f < 100000; f++) { publish(rgba, f); try { Thread.sleep(200); } catch (Exception e) { break; } }
    }
}
