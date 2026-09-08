import java.awt.*;
import java.awt.image.*;
import java.io.*;
import javax.swing.*;
import javax.swing.plaf.metal.MetalLookAndFeel;

/**
 * A "windowed" Swing scene on the wasm JVM with keyboard capture.
 *
 * A JDesktopPane hosts a real JInternalFrame (title bar, borders, close/resize
 * chrome — a genuine Swing window, lightweight so it needs no native peer). The
 * frame holds a JTextArea plus buttons. Canvas pointer events (seq state x y,
 * state 1=down/2=drag/3=up) drive the button models and let you drag the window
 * by its title bar; canvas key events (state 4, x=keyCode, y=charCode) are routed
 * into the focused JTextArea so you can type into it. The whole desktop is
 * painted to a BufferedImage each frame and blitted to the browser canvas.
 */
public class WindowApp {
    static final int W = 520, H = 380;
    static final int TITLE_H = 26;

    public static void main(String[] args) throws Exception {
        UIManager.setLookAndFeel(new MetalLookAndFeel());

        JDesktopPane desktop = new JDesktopPane();
        desktop.setSize(W, H);
        desktop.setBackground(new Color(58, 74, 104));

        JInternalFrame frame = new JInternalFrame("Notes — click, then type", true, true, true, true);
        JPanel content = new JPanel(new BorderLayout(6, 6));
        content.setBorder(BorderFactory.createEmptyBorder(6, 6, 6, 6));

        JTextArea area = new JTextArea("Type on your keyboard — this is a real Swing JTextArea.\n\n");
        area.setFont(new Font(Font.MONOSPACED, Font.PLAIN, 13));
        area.setLineWrap(true);
        content.add(new JScrollPane(area), BorderLayout.CENTER);

        JLabel status = new JLabel("chars: 0");
        JButton clear = new JButton("Clear");
        clear.addActionListener(e -> { area.setText(""); status.setText("chars: 0"); });
        JPanel south = new JPanel(new BorderLayout());
        south.add(status, BorderLayout.WEST);
        south.add(clear, BorderLayout.EAST);
        content.add(south, BorderLayout.SOUTH);

        frame.setContentPane(content);
        frame.setBounds(36, 30, 440, 300);
        frame.setVisible(true);
        desktop.add(frame);
        try { frame.setSelected(true); } catch (Exception ignore) {}

        desktop.doLayout(); layout(desktop);

        BufferedImage img = new BufferedImage(W, H, BufferedImage.TYPE_INT_RGB);
        byte[] rgba = new byte[W * H * 4];
        for (int i = 3; i < rgba.length; i += 4) rgba[i] = (byte) 255;

        boolean draggingFrame = false; int dragDX = 0, dragDY = 0;
        System.out.println("[window] up; internal frame at " + frame.getBounds());

        for (long f = 0; ; f++) {
            java.util.List<int[]> events = drain();       // ALL events since last frame, in order
            if (!events.isEmpty()) {
                for (int[] c : events) {
                    int state = c[0], a = c[1], b = c[2];
                    if (state == 4) {                                  // key event
                        typeInto(area, a, b, status);
                    } else {                                           // pointer event
                        int x = a, y = b;
                        Rectangle fb = frame.getBounds();
                        boolean inTitle = new Rectangle(fb.x, fb.y, fb.width, TITLE_H).contains(x, y);
                        if (state == 1) {
                            if (inTitle) { draggingFrame = true; dragDX = x - fb.x; dragDY = y - fb.y; }
                            else driveButton(desktop, x, y, true);
                        } else if (state == 2 && draggingFrame) {
                            frame.setLocation(Math.max(-fb.width + 40, Math.min(W - 40, x - dragDX)),
                                              Math.max(0, Math.min(H - TITLE_H, y - dragDY)));
                        } else if (state == 3) {
                            if (!draggingFrame) driveButton(desktop, x, y, false);
                            draggingFrame = false;
                        }
                    }
                }
                layout(desktop);
            }
            Graphics2D g = img.createGraphics();
            g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
            g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
            desktop.paint(g);
            g.dispose();
            publish(img, rgba, f);
            Thread.sleep(16);
        }
    }

    /* Route a key into the text area (keyCode, charCode). */
    static void typeInto(JTextArea area, int keyCode, int charCode, JLabel status) {
        try {
            if (keyCode == 8) {                       // backspace
                int n = area.getDocument().getLength();
                if (n > 0) area.getDocument().remove(n - 1, 1);
            } else if (keyCode == 13) {               // enter
                area.append("\n");
            } else if (charCode >= 32 && charCode < 127) {
                area.append(String.valueOf((char) charCode));
            }
            status.setText("chars: " + area.getDocument().getLength());
        } catch (Exception ignore) {}
    }

    static void driveButton(Container root, int x, int y, boolean down) {
        Component t = SwingUtilities.getDeepestComponentAt(root, x, y);
        while (t != null && !(t instanceof AbstractButton)) t = t.getParent();
        if (t instanceof AbstractButton bt && bt.isEnabled()) {
            ButtonModel m = bt.getModel();
            if (down) { m.setArmed(true); m.setPressed(true); }
            else { m.setPressed(false); m.setArmed(false); }
        }
    }

    static void layout(Container c) {
        c.doLayout();
        for (Component ch : c.getComponents()) if (ch instanceof Container cc) layout(cc);
    }

    /* Append-log event channel: JS appends "seq state a b" lines; we drain every
     * complete line past our byte offset (so nothing is coalesced/lost, unlike a
     * single-latest file). seq is ignored here — the byte offset is the cursor. */
    static int processed = 0;
    static java.util.List<int[]> drain() {
        java.util.List<int[]> out = new java.util.ArrayList<>();
        try {
            File fl = new File("/work/ctrl");
            if (!fl.exists()) return out;
            // Fresh read each frame so we always see the latest appended bytes
            // (a long-lived read fd's cached length was missing appends). Each JS
            // append is a whole "seq state a b\n" line, so no partial lines.
            java.util.List<String> lines = java.nio.file.Files.readAllLines(fl.toPath());
            if (lines.size() < processed) processed = 0;    // channel reset
            for (int i = processed; i < lines.size(); i++) {
                String[] p = lines.get(i).trim().split("\\s+");
                if (p.length < 4) continue;
                out.add(new int[]{ Integer.parseInt(p[1]), Integer.parseInt(p[2]), Integer.parseInt(p[3]) });
            }
            processed = lines.size();
        } catch (Exception e) {}
        return out;
    }

    static void publish(BufferedImage img, byte[] rgba, long seq) throws IOException {
        int[] px = ((DataBufferInt) img.getRaster().getDataBuffer()).getData();
        for (int i = 0, o = 0; i < px.length; i++, o += 4) {
            int v = px[i];
            rgba[o] = (byte)(v >> 16); rgba[o+1] = (byte)(v >> 8); rgba[o+2] = (byte)(v);
        }
        try (OutputStream os = new FileOutputStream("/work/frame.tmp")) { os.write(rgba); }
        new File("/work/frame.tmp").renameTo(new File("/work/frame.bin"));
        try (Writer w = new FileWriter("/work/seq")) { w.write(Long.toString(seq)); }
    }
}
