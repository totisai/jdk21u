import java.awt.*;
import java.awt.geom.*;
import java.awt.image.*;
import java.io.*;
import javax.swing.*;
import javax.swing.plaf.metal.MetalLookAndFeel;

/**
 * Interactive Swing demo on the wasm JVM, tuned for the Zero interpreter:
 *  - the static scene (gradient background, title, ledge, ground) is painted
 *    ONCE into a background image;
 *  - the Metal JButton is painted only when its state changes, cached as an image;
 *  - each frame just blits the background + cached button, draws the moving ball
 *    and a short status line, then publishes raw RGBA to /work/frame.bin (+ a tiny
 *    /work/seq) so JS can build ImageData with no per-pixel work.
 */
public class Ball {
    static final int W = 440, H = 320, R = 18;
    static final double LEDGE_Y = 150, GROUND_Y = H - 26;
    static final int BX = W/2 - 78, BY = H - 60, BW = 156, BH = 38;

    static final Font TITLE = new Font(Font.SANS_SERIF, Font.BOLD, 20);
    static final Font SMALL = new Font(Font.SANS_SERIF, Font.PLAIN, 12);

    public static void main(String[] args) throws Exception {
        UIManager.setLookAndFeel(new MetalLookAndFeel());
        JButton button = new JButton("Drop the ball!");
        button.setSize(BW, BH);
        button.setFont(new Font(Font.SANS_SERIF, Font.BOLD, 15));
        button.setForeground(new Color(20, 24, 40));
        CellRendererPane rp = new CellRendererPane();

        BufferedImage bg = buildBackground();
        BufferedImage img = new BufferedImage(W, H, BufferedImage.TYPE_INT_RGB);
        BufferedImage btnCache = null;
        String btnKey = "";

        byte[] rgba = new byte[W * H * 4];
        for (int i = 3; i < rgba.length; i += 4) rgba[i] = (byte) 255;  // alpha once

        double x = 40, y = LEDGE_Y - R, vx = 2.4, vy = 0, spin = 0;
        boolean falling = false, onGround = false, grabbing = false;
        double dragPrevX = 0, dragPrevY = 0;
        long lastEvt = -1;
        int pressFlash = 0;

        long fpsT0 = System.currentTimeMillis(); int fpsN = 0;
        System.out.println("[ball] interactive loop start");

        for (long frame = 0; ; frame++) {
            // input: {seq, state, x, y}  state 1=down 2=drag 3=up
            long[] c = readClick();
            if (c != null && c[0] != lastEvt) {
                lastEvt = c[0];
                int state = (int) c[1], ex = (int) c[2], ey = (int) c[3];
                boolean inBall = (ex - x)*(ex - x) + (ey - y)*(ey - y) <= (R+4)*(R+4);
                boolean inButton = ex >= BX && ex <= BX+BW && ey >= BY && ey <= BY+BH;
                if (state == 1) {                       // pointer down
                    if (inBall) {                       // grab the ball
                        grabbing = true; falling = false; onGround = false;
                        vx = vy = 0; dragPrevX = x; dragPrevY = y;
                    } else if (inButton) {              // button acts on press
                        pressFlash = 5;
                        if (!falling && !onGround) { falling = true; vy = 0; }
                        else { falling = onGround = false; y = LEDGE_Y - R; }
                    }
                } else if (state == 2 && grabbing) {    // drag: follow the pointer
                    dragPrevX = x; dragPrevY = y;
                    x = Math.max(R, Math.min(W - R, ex));
                    y = Math.max(R, Math.min(H - R, ey));
                    spin += (x - dragPrevX) / R;
                } else if (state == 3 && grabbing) {    // release: throw + fall
                    grabbing = false; falling = true;
                    vx = Math.max(-14, Math.min(14, (x - dragPrevX) * 1.2));
                    vy = Math.max(-14, Math.min(14, (y - dragPrevY) * 1.2));
                }
            }

            if (grabbing) {
                // held: no physics
            } else if (!falling && !onGround) {
                x += vx; spin += vx / R;
                if (x < R+16 || x > W-R-16) vx = -vx;
            } else if (falling) {
                vy += 0.9; x += vx; y += vy; spin += vx / R + 0.02;
                if (x < R || x > W-R) { vx = -vx*0.7; x = Math.max(R, Math.min(W-R, x)); }
                if (y >= GROUND_Y - R) { y = GROUND_Y - R;
                    if (vy > 1.5) { vy = -vy*0.55; vx *= 0.8; }
                    else { vy = 0; if (Math.abs(vx) < 0.5) { falling = false; onGround = true; vx = 0; } } }
            }

            // (re)paint the button only when its visible state changes
            boolean pressed = pressFlash > 0;
            String txt = onGround ? "Reset" : "Drop the ball!";
            String key = txt + pressed;
            if (!key.equals(btnKey)) {
                btnKey = key;
                if (btnCache == null) btnCache = new BufferedImage(BW, BH, BufferedImage.TYPE_INT_ARGB);
                Graphics2D bgr = btnCache.createGraphics();
                bgr.setComposite(AlphaComposite.Clear); bgr.fillRect(0, 0, BW, BH);
                bgr.setComposite(AlphaComposite.SrcOver);
                bgr.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
                button.setText(txt);
                button.getModel().setPressed(pressed); button.getModel().setArmed(pressed);
                rp.paintComponent(bgr, button, null, 0, 0, BW, BH, true);
                bgr.dispose();
            }
            if (pressFlash > 0) pressFlash--;

            // ---- compose frame: static bg + cached button + moving bits ----
            Graphics2D g = img.createGraphics();
            g.drawImage(bg, 0, 0, null);
            g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);

            g.setColor(new Color(170, 190, 240));
            g.setFont(SMALL);
            g.drawString(grabbing ? "dragging — release to throw"
                         : onGround ? "…thud. Click the button to reset."
                         : falling ? "falling!" : "drag the ball, or click the button to drop it", 20, 52);

            g.setColor(new Color(255, 90, 90));
            g.fill(new Ellipse2D.Double(x - R, y - R, 2*R, 2*R));
            g.setColor(new Color(255, 210, 210));
            g.setStroke(new BasicStroke(3));
            for (int k = 0; k < 2; k++) {
                double a = spin + k * Math.PI/2;
                g.draw(new Line2D.Double(x - Math.cos(a)*R*0.8, y - Math.sin(a)*R*0.8,
                                         x + Math.cos(a)*R*0.8, y + Math.sin(a)*R*0.8));
            }
            g.drawImage(btnCache, BX, BY, null);
            g.dispose();

            publish(img, rgba, frame);

            fpsN++;
            long now = System.currentTimeMillis();
            if (now - fpsT0 >= 2000) {
                System.out.println("[ball] fps=" + (fpsN * 1000L / (now - fpsT0)));
                fpsT0 = now; fpsN = 0;
            }
            Thread.sleep(8);
        }
    }

    static BufferedImage buildBackground() {
        BufferedImage bg = new BufferedImage(W, H, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = bg.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
        g.setPaint(new GradientPaint(0, 0, new Color(18, 22, 38), 0, H, new Color(44, 26, 58)));
        g.fillRect(0, 0, W, H);
        g.setColor(Color.WHITE);
        g.setFont(TITLE);
        g.drawString("Swing on WebAssembly", 20, 34);
        g.setColor(new Color(120, 130, 170));
        g.setStroke(new BasicStroke(4));
        g.drawLine(16, (int) LEDGE_Y, W-16, (int) LEDGE_Y);
        g.setColor(new Color(90, 100, 140));
        g.fillRect(0, (int) GROUND_Y, W, H - (int) GROUND_Y);
        g.dispose();
        return bg;
    }

    static long[] readClick() {
        try (BufferedReader r = new BufferedReader(new FileReader("/work/ctrl"))) {
            String line = r.readLine();
            if (line == null) return null;
            String[] p = line.trim().split("\\s+");
            if (p.length < 4) return null;
            return new long[]{ Long.parseLong(p[0]), Long.parseLong(p[1]),
                               Long.parseLong(p[2]), Long.parseLong(p[3]) };
        } catch (Exception e) { return null; }
    }

    static void publish(BufferedImage img, byte[] rgba, long seq) throws IOException {
        int[] px = ((DataBufferInt) img.getRaster().getDataBuffer()).getData();
        for (int i = 0, o = 0; i < px.length; i++, o += 4) {
            int v = px[i];
            rgba[o]   = (byte)(v >> 16);
            rgba[o+1] = (byte)(v >> 8);
            rgba[o+2] = (byte)(v);
        }
        try (OutputStream os = new FileOutputStream("/work/frame.tmp")) { os.write(rgba); }
        new File("/work/frame.tmp").renameTo(new File("/work/frame.bin"));
        try (Writer w = new FileWriter("/work/seq")) { w.write(Long.toString(seq)); }
    }
}
