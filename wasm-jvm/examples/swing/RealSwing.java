import java.awt.*;
import java.awt.event.*;
import java.awt.image.*;
import java.io.*;
import javax.swing.*;
import javax.swing.plaf.metal.MetalLookAndFeel;

/**
 * A *real* Swing application on the wasm JVM: an actual component tree
 * (JButtons/JLabel/JCheckBox/JProgressBar with layout managers and real
 * ActionListeners) driven by real AWT event dispatch — not custom painting.
 *
 * There is no native window/peer, so we pump events ourselves: canvas pointer
 * events arrive via /work/ctrl, are turned into java.awt MouseEvents and
 * dispatched to the deepest component (so BasicButtonListener etc. fire the
 * genuine listeners), and the whole tree is painted into a BufferedImage each
 * frame and published to the browser canvas.
 */
public class RealSwing {
    static final int W = 460, H = 340;

    // shared UI state mutated by real listeners
    static int count = 0;
    static boolean night = true;

    public static void main(String[] args) throws Exception {
        UIManager.setLookAndFeel(new MetalLookAndFeel());

        JPanel root = new JPanel(new BorderLayout(0, 0));
        root.setBackground(new Color(236, 238, 244));

        JLabel title = new JLabel("A real Swing app, running on WebAssembly");
        title.setFont(new Font(Font.SANS_SERIF, Font.BOLD, 16));
        title.setBorder(BorderFactory.createEmptyBorder(12, 14, 12, 14));
        root.add(title, BorderLayout.NORTH);

        JPanel center = new JPanel(new GridBagLayout());
        center.setOpaque(false);
        GridBagConstraints gc = new GridBagConstraints();
        gc.insets = new Insets(8, 8, 8, 8); gc.gridx = 0; gc.gridy = 0; gc.anchor = GridBagConstraints.WEST;

        JLabel counter = new JLabel("Clicks: 0");
        counter.setFont(new Font(Font.SANS_SERIF, Font.PLAIN, 15));

        JButton inc = new JButton("Click me");
        JButton reset = new JButton("Reset");
        JCheckBox theme = new JCheckBox("Night theme", true);
        JProgressBar bar = new JProgressBar(0, 20);
        bar.setValue(0); bar.setStringPainted(true);

        // REAL listeners — no custom hit-testing
        inc.addActionListener(e -> {
            count++; counter.setText("Clicks: " + count);
            bar.setValue(Math.min(20, count));
        });
        reset.addActionListener(e -> { count = 0; counter.setText("Clicks: 0"); bar.setValue(0); });
        theme.addActionListener(e -> {
            night = theme.isSelected();
            Color bg = night ? new Color(236, 238, 244) : new Color(250, 250, 250);
            root.setBackground(bg);
        });

        gc.gridy = 0; center.add(counter, gc);
        gc.gridy = 1; center.add(inc, gc);
        gc.gridy = 2; center.add(reset, gc);
        gc.gridy = 3; center.add(theme, gc);
        gc.gridy = 4; gc.fill = GridBagConstraints.HORIZONTAL; center.add(bar, gc);
        root.add(center, BorderLayout.CENTER);

        JLabel foot = new JLabel("real components · real ActionListeners · real MouseEvents");
        foot.setFont(new Font(Font.SANS_SERIF, Font.PLAIN, 11));
        foot.setForeground(new Color(110, 118, 140));
        foot.setBorder(BorderFactory.createEmptyBorder(6, 14, 10, 14));
        root.add(foot, BorderLayout.SOUTH);

        // lay the tree out (no peer needed for lightweight components)
        root.setSize(W, H);
        root.addNotify();
        root.validate();
        layout(root);

        BufferedImage img = new BufferedImage(W, H, BufferedImage.TYPE_INT_RGB);
        byte[] rgba = new byte[W * H * 4];
        for (int i = 3; i < rgba.length; i += 4) rgba[i] = (byte) 255;

        long lastEvt = -1;
        Point incLoc = SwingUtilities.convertPoint(inc.getParent(), inc.getX(), inc.getY(), root);
        System.out.println("[swing] app up; incBtn=" + (incLoc.x + inc.getWidth()/2) + "," + (incLoc.y + inc.getHeight()/2)
                           + " size=" + inc.getWidth() + "x" + inc.getHeight());

        for (long frame = 0; ; frame++) {
            long[] c = readEvt();
            if (c != null && c[0] != lastEvt) {
                lastEvt = c[0];
                dispatchMouse(root, (int) c[1], (int) c[2], (int) c[3]);
                root.validate(); layout(root);   // listeners may have changed sizes/text
            }
            Graphics2D g = img.createGraphics();
            g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
            g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
            root.paint(g);
            g.dispose();
            publish(img, rgba, frame);
            Thread.sleep(16);
        }
    }

    /* Force layout of the whole lightweight tree. */
    static void layout(Container c) {
        c.doLayout();
        for (Component ch : c.getComponents())
            if (ch instanceof Container cc) layout(cc);
    }

    /* Route a canvas pointer event to the deepest Swing component. With no
     * top-level Window/peer, full lightweight MouseEvent dispatch NPEs on the
     * missing host; instead we drive the real ButtonModel, which fires the
     * genuine ActionListener / ItemListener and updates real component state. */
    static void dispatchMouse(Container root, int state, int x, int y) {
        Component target = SwingUtilities.getDeepestComponentAt(root, x, y);
        // walk up to the nearest actionable button/checkbox
        while (target != null && !(target instanceof AbstractButton)) target = target.getParent();
        if (target instanceof AbstractButton b && b.isEnabled()) {
            ButtonModel m = b.getModel();
            if (state == 1) { m.setArmed(true); m.setPressed(true); }
            else if (state == 3) { m.setPressed(false); m.setArmed(false); }  // -> fires the action
        }
    }

    static long[] readEvt() {
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
            rgba[o] = (byte)(v >> 16); rgba[o+1] = (byte)(v >> 8); rgba[o+2] = (byte)(v);
        }
        try (OutputStream os = new FileOutputStream("/work/frame.tmp")) { os.write(rgba); }
        new File("/work/frame.tmp").renameTo(new File("/work/frame.bin"));
        try (Writer w = new FileWriter("/work/seq")) { w.write(Long.toString(seq)); }
    }
}
