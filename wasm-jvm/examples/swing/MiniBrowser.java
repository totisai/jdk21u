import java.awt.*;
import java.awt.geom.Point2D;
import java.awt.geom.Rectangle2D;
import java.awt.image.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.List;
import javax.swing.*;
import javax.swing.plaf.metal.MetalLookAndFeel;
import javax.swing.text.*;
import javax.swing.text.html.*;

/**
 * A minimal web browser built from Swing's HTML component (JEditorPane +
 * HTMLEditorKit), running on the wasm JVM and rendered to the browser canvas.
 * Renders a small in-memory multi-page "site"; hyperlinks navigate (detected via
 * viewToModel2D + the HTML anchor attribute, since we route pointer events
 * ourselves); Back/Home drive real ButtonModels; the wheel scrolls the page.
 */
public class MiniBrowser {
    static final int W = 640, H = 460, TITLE_H = 26;
    static final Map<String,String> SITE = new HashMap<>();
    static final Deque<String> history = new ArrayDeque<>();

    static JEditorPane editor;
    static JScrollPane scroll;
    static JTextField address;
    static boolean addrActive = false;    // is the address bar the keyboard target?
    static boolean addrSelecting = false; // dragging to select text in the address bar
    static volatile String pendingHtml = null;   // result from the fetch thread, applied on the loop thread

    public static void main(String[] args) throws Exception {
        UIManager.setLookAndFeel(new MetalLookAndFeel());
        buildSite();

        JDesktopPane desktop = new JDesktopPane();
        desktop.setSize(W, H);
        desktop.setBackground(new Color(52, 66, 92));

        JInternalFrame frame = new JInternalFrame("Mini Browser — Swing JEditorPane", true, false, false, false);
        JPanel content = new JPanel(new BorderLayout(4, 4));
        content.setBorder(BorderFactory.createEmptyBorder(4, 4, 4, 4));

        JButton back = new JButton("← Back");
        JButton home = new JButton("Home");
        address = new JTextField();          // editable: type a page and press Enter
        address.setBorder(BorderFactory.createCompoundBorder(
            BorderFactory.createLineBorder(new Color(180,185,200)),
            BorderFactory.createEmptyBorder(3, 8, 3, 8)));
        JPanel bar = new JPanel(new BorderLayout(4, 0));
        JPanel navbtns = new JPanel(new FlowLayout(FlowLayout.LEFT, 4, 0));
        navbtns.add(back); navbtns.add(home);
        bar.add(navbtns, BorderLayout.WEST);
        bar.add(address, BorderLayout.CENTER);
        content.add(bar, BorderLayout.NORTH);

        editor = new JEditorPane();
        editor.setEditable(false);
        editor.setContentType("text/html");
        editor.putClientProperty(JEditorPane.HONOR_DISPLAY_PROPERTIES, Boolean.TRUE);
        scroll = new JScrollPane(editor);
        content.add(scroll, BorderLayout.CENTER);

        back.addActionListener(e -> { if (history.size() > 1) { history.pop(); show(history.peek()); } });
        home.addActionListener(e -> navigate("home"));

        frame.setContentPane(content);
        frame.setBounds(20, 16, 600, 428);
        frame.setVisible(true);
        desktop.add(frame);
        try { frame.setSelected(true); } catch (Exception ignore) {}
        desktop.doLayout(); layout(desktop);
        navigate("home");
        layout(desktop);

        BufferedImage img = new BufferedImage(W, H, BufferedImage.TYPE_INT_RGB);
        byte[] rgba = new byte[W * H * 4];
        for (int i = 3; i < rgba.length; i += 4) rgba[i] = (byte) 255;

        boolean draggingFrame = false; int dragDX = 0, dragDY = 0;
        System.out.println("[browser] up");

        for (long f = 0; ; f++) {
            if (pendingHtml != null) {   // apply a fetch result on THIS (the only Swing) thread
                String h = pendingHtml; pendingHtml = null;
                try { editor.setText(h); editor.setCaretPosition(0); } catch (Throwable t) {}
                layout(desktop);
            }
            for (int[] c : drain()) {
                int state = c[0], a = c[1], b = c[2];
                if (state == 4) {                                  // keyboard
                    typeUrl(a, b);
                } else if (state == 5) {                           // wheel: scroll page
                    JScrollBar vs = scroll.getVerticalScrollBar();
                    vs.setValue(vs.getValue() + b);
                } else {
                    int x = a, y = b;
                    Rectangle fb = frame.getBounds();
                    boolean inTitle = new Rectangle(fb.x, fb.y, fb.width, TITLE_H).contains(x, y);
                    if (state == 1) {
                        boolean hitAddr = (SwingUtilities.getDeepestComponentAt(desktop, x, y) == address);
                        if (hitAddr) {
                            if (!addrActive) { addrActive = true; address.selectAll(); }   // browser-like: select all on focus
                            else { try { address.setCaretPosition(viewToModelAddr(desktop, x, y)); addrSelecting = true; } catch (Exception e) {} }
                        } else {
                            addrActive = false;
                            if (inTitle) { draggingFrame = true; dragDX = x - fb.x; dragDY = y - fb.y; }
                            else driveButton(desktop, x, y, true);
                        }
                    } else if (state == 2 && addrSelecting) {   // drag to select
                        try { address.moveCaretPosition(viewToModelAddr(desktop, x, y)); } catch (Exception e) {}
                    } else if (state == 2 && draggingFrame) {
                        frame.setLocation(Math.max(-fb.width + 40, Math.min(W - 40, x - dragDX)),
                                          Math.max(0, Math.min(H - TITLE_H, y - dragDY)));
                    } else if (state == 3) {
                        addrSelecting = false;
                        if (draggingFrame) { draggingFrame = false; }
                        else {
                            driveButton(desktop, x, y, false);
                            followLinkAt(desktop, x, y);
                        }
                    }
                }
                layout(desktop);
            }
            // visual cue for the focused address bar
            address.setBackground(addrActive ? new Color(255, 252, 214) : Color.WHITE);
            Graphics2D g = img.createGraphics();
            g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
            g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
            desktop.paint(g);
            paintAddressCaret(g, desktop, f);   // our own caret/selection (no native focus)
            g.dispose();
            publish(img, rgba, f);
            Thread.sleep(16);
        }
    }

    /* Route a key into the address bar. The address bar has no native focus, so the
     * DefaultCaret does not track document changes — we advance the caret ourselves. */
    static void typeUrl(int keyCode, int charCode) {
        if (!addrActive) return;
        try {
            Document d = address.getDocument();
            int ss = address.getSelectionStart(), se = address.getSelectionEnd();
            if (keyCode == 8) {                                  // backspace
                if (ss != se) { d.remove(ss, se - ss); address.setCaretPosition(ss); }
                else { int c = address.getCaretPosition(); if (c > 0) { d.remove(c - 1, 1); address.setCaretPosition(c - 1); } }
            } else if (keyCode == 13) {                          // enter -> navigate
                navigate(address.getText().trim()); addrActive = false;
            } else if (keyCode == 37) {                          // arrow left
                address.setCaretPosition(Math.max(0, address.getCaretPosition() - 1));
            } else if (keyCode == 39) {                          // arrow right
                address.setCaretPosition(Math.min(d.getLength(), address.getCaretPosition() + 1));
            } else if (keyCode == 36) { address.setCaretPosition(0); }              // home
            else if (keyCode == 35) { address.setCaretPosition(d.getLength()); }    // end
            else if (charCode >= 32 && charCode < 127) {         // insert at caret / replace selection
                if (ss != se) d.remove(ss, se - ss);
                int pos = (ss != se) ? ss : address.getCaretPosition();
                d.insertString(pos, String.valueOf((char) charCode), null);
                address.setCaretPosition(pos + 1);
            }
        } catch (Exception e) {}
    }

    static int viewToModelAddr(Container root, int x, int y) {
        Point p = SwingUtilities.convertPoint(root, new Point(x, y), address);
        return Math.max(0, address.viewToModel2D(new Point2D.Double(p.x, p.y)));
    }

    /* Draw our own caret + selection for the address bar (no native focus). */
    static void paintAddressCaret(Graphics2D g, Container desktop, long frame) {
        if (!addrActive) return;
        try {
            int ss = address.getSelectionStart(), se = address.getSelectionEnd();
            if (ss != se) {
                Rectangle2D a = address.modelToView2D(ss), b = address.modelToView2D(se);
                Point p1 = SwingUtilities.convertPoint(address, new Point((int) a.getX(), (int) a.getY()), desktop);
                Point p2 = SwingUtilities.convertPoint(address, new Point((int) b.getX(), (int) b.getY()), desktop);
                g.setColor(new Color(80, 150, 255, 110));
                g.fillRect(p1.x, p1.y, Math.max(1, p2.x - p1.x), (int) a.getHeight());
            }
            if ((frame / 25) % 2 == 0) {                          // blink
                Rectangle2D c = address.modelToView2D(address.getCaretPosition());
                Point p = SwingUtilities.convertPoint(address, new Point((int) c.getX(), (int) c.getY()), desktop);
                g.setColor(Color.BLACK);
                g.drawLine(p.x, p.y + 1, p.x, p.y + (int) c.getHeight() - 2);
            }
        } catch (Exception e) {}
    }

    static String clean(String s) {
        s = s.trim();
        if (s.startsWith("wasm://")) s = s.substring(7);
        int slash = s.indexOf('/'); if (slash >= 0) s = s.substring(slash + 1);
        return s.isEmpty() ? "home" : s;
    }

    static void navigate(String name) {
        String n = name.trim();
        // A real URL (has a scheme or a dotted host) -> fetch it over the network.
        if (n.startsWith("http://") || n.startsWith("https://") || n.matches("[\\w.-]+\\.[a-zA-Z]{2,}(/.*)?")) {
            fetchExternal(n.matches("https?://.*") ? n : "http://" + n);
            return;
        }
        String page = clean(n);
        if (history.isEmpty() || !history.peek().equals(page)) history.push(page);
        show(page);
    }

    /* Fetch a real URL over HTTP (via the TCP relay) and render it in JEditorPane. */
    static void fetchExternal(String url) {
        address.setText(url);
        editor.setText("<html><body><p style='color:#888'>Loading " + esc(url) + " …</p></body></html>");
        new Thread(() -> {
            try {
                HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
                c.setInstanceFollowRedirects(true);
                c.setConnectTimeout(9000); c.setReadTimeout(9000);
                c.setRequestProperty("User-Agent", "wasm-swing-browser/0.1");
                int code = c.getResponseCode();
                InputStream in = (code >= 400 && c.getErrorStream() != null) ? c.getErrorStream() : c.getInputStream();
                byte[] body = in.readNBytes(400_000);
                pendingHtml = new String(body, StandardCharsets.UTF_8);   // applied on the loop thread
            } catch (Throwable e) {
                pendingHtml =
                    "<html><head><style>body{font-family:sans-serif;margin:12px}</style></head><body>"
                    + "<h2>Can’t load " + esc(url) + "</h2><p>" + esc(String.valueOf(e)) + "</p>"
                    + "<p>External URLs need a networking-enabled build (a WebSocket&#8594;TCP relay). "
                    + "See wasm-jvm/docs/native-awt-build.md &rarr; Networking, and run <tt>node tcp-relay.cjs 8114</tt>. "
                    + "Note HTTPS-only / JavaScript-heavy sites (e.g. google.com) won’t render in Swing’s "
                    + "HTML component regardless — try a simple http:// page.</p>"
                    + "<p><a href='home'>&#8592; Home</a></p></body></html>";
            }
        }).start();
    }
    static String esc(String s) { return s.replace("&","&amp;").replace("<","&lt;").replace(">","&gt;"); }
    static void show(String name) {
        String html = SITE.getOrDefault(name, "<html><body><h2>404</h2><p>No page '" + name + "'.</p></body></html>");
        editor.setText(html);
        editor.setCaretPosition(0);
        address.setText("wasm://" + name);
        SwingUtilities.invokeLater(() -> scroll.getVerticalScrollBar().setValue(0));
    }

    /* Detect an HTML anchor under the click and navigate to its href. */
    static void followLinkAt(Container root, int x, int y) {
        Component deep = SwingUtilities.getDeepestComponentAt(root, x, y);
        if (deep != editor) return;
        Point p = SwingUtilities.convertPoint(root, new Point(x, y), editor);
        int pos = editor.viewToModel2D(new Point2D.Double(p.x, p.y));
        if (pos < 0) return;
        Element el = ((HTMLDocument) editor.getDocument()).getCharacterElement(pos);
        Object a = el.getAttributes().getAttribute(HTML.Tag.A);
        if (a instanceof AttributeSet aset) {
            Object href = aset.getAttribute(HTML.Attribute.HREF);
            if (href != null) navigate(href.toString());
        }
    }

    static void buildSite() {
        String css = "<style>body{font-family:sans-serif;margin:12px;color:#20242e;}"
            + "h1{color:#2f6db3;} a{color:#c85a1e;} .card{background:#eef2f8;padding:8px;}</style>";
        SITE.put("home", "<html><head>" + css + "</head><body>"
            + "<h1>Swing on WebAssembly</h1>"
            + "<p>This page is rendered by <b>javax.swing.JEditorPane</b> (the HTML"
            + " component) running on a real OpenJDK JVM compiled to WebAssembly.</p>"
            + "<p>Navigate:</p><ul>"
            + "<li><a href='about'>About this browser</a></li>"
            + "<li><a href='java'>What is running</a></li>"
            + "<li><a href='list'>A styled list</a></li></ul>"
            + "<div class='card'>Click a link above, or click the address bar and type a"
            + " page name (home / about / java / list) then press Enter. Use the mouse"
            + " wheel to scroll and drag the title bar to move the window.</div>"
            + "</body></html>");
        SITE.put("about", "<html><head>" + css + "</head><body>"
            + "<h1>About</h1><p>A minimal web browser built entirely from core Java"
            + " Swing: <tt>JEditorPane</tt> + <tt>HTMLEditorKit</tt>. Hyperlinks are"
            + " resolved from the HTML anchor attributes and navigated in-process.</p>"
            + "<p><a href='home'>&#8592; Home</a></p></body></html>");
        SITE.put("java", "<html><head>" + css + "</head><body>"
            + "<h1>What is running</h1>"
            + "<table border='1' cellpadding='4'><tr><td>VM</td><td>HotSpot Zero (interpreter)</td></tr>"
            + "<tr><td>Target</td><td>wasm32 / Emscripten</td></tr>"
            + "<tr><td>UI</td><td>AWT/Java2D + Swing &#8594; canvas</td></tr></table>"
            + "<p><a href='home'>&#8592; Home</a></p></body></html>");
        StringBuilder li = new StringBuilder();
        for (int i = 1; i <= 20; i++) li.append("<li>Item ").append(i).append(" &mdash; scroll to see the wheel work</li>");
        SITE.put("list", "<html><head>" + css + "</head><body><h1>A long list</h1><ol>"
            + li + "</ol><p><a href='home'>&#8592; Home</a></p></body></html>");
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

    static int processed = 0;
    static List<int[]> drain() {
        List<int[]> out = new ArrayList<>();
        try {
            File fl = new File("/work/ctrl");
            if (!fl.exists()) return out;
            List<String> lines = java.nio.file.Files.readAllLines(fl.toPath());
            if (lines.size() < processed) processed = 0;
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
