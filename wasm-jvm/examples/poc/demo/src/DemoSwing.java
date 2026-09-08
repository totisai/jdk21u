import javax.swing.*;
import java.awt.*;
import java.awt.event.*;
import java.util.*;
import java.util.List;
import java.io.*;
import java.net.*;

/** A small but real Swing desktop app: menu, toolbar buttons, a live text editor
 *  (type into it), a status bar, and a scribble canvas (drag the mouse to draw). */
public class DemoSwing {
    static int clicks = 0;
    public static void main(String[] args) {
        SwingUtilities.invokeLater(DemoSwing::build);
    }
    static void build() {
        JFrame f = new JFrame("Demo IDE — running on a WebAssembly JVM");
        f.setDefaultCloseOperation(JFrame.DISPOSE_ON_CLOSE);
        f.setSize(1200, 800);

        JMenuBar mb = new JMenuBar();
        JMenu file = new JMenu("File"); file.add(new JMenuItem("New")); file.add(new JMenuItem("Open")); file.add(new JMenuItem("Exit"));
        JMenu edit = new JMenu("Edit"); edit.add(new JMenuItem("Cut")); edit.add(new JMenuItem("Copy")); edit.add(new JMenuItem("Paste"));
        mb.add(file); mb.add(edit);
        f.setJMenuBar(mb);

        JLabel status = new JLabel("Ready.");
        status.setBorder(BorderFactory.createEmptyBorder(4, 10, 4, 10));

        JToolBar tb = new JToolBar(); tb.setFloatable(false);
        JButton clickBtn = new JButton("Click me");
        JButton clearBtn = new JButton("Clear editor");
        JLabel counter = new JLabel("  Clicks: 0   ");
        clickBtn.addActionListener(e -> { clicks++; counter.setText("  Clicks: " + clicks + "   "); status.setText("Button clicked " + clicks + " time(s)"); });

        // Networking proof: fetch a real website over the WebSocket->TCP relay.
        // Target comes from -Ddemo.fetchUrl (kept in sync with the relay's single
        // target); defaults to example.com. Runs off the EDT with short timeouts so
        // it degrades gracefully to "network unavailable" when the relay is off.
        final String fetchUrl = System.getProperty("demo.fetchUrl", "http://example.com/");
        JButton netBtn = new JButton("Fetch " + hostOf(fetchUrl));
        netBtn.addActionListener(e -> {
            netBtn.setEnabled(false);
            status.setText("Fetching " + fetchUrl + " …");
            new Thread(() -> {
                String msg;
                try { msg = fetchSite(fetchUrl); }
                catch (Throwable t) { msg = "network unavailable — is the relay running? (" + t + ")"; }
                final String out = msg;
                SwingUtilities.invokeLater(() -> { status.setText(out); netBtn.setEnabled(true);
                    JOptionPane.showMessageDialog(f, out, "HTTP fetch result", JOptionPane.INFORMATION_MESSAGE); });
            }, "demo-fetch").start();
        });

        tb.add(clickBtn); tb.add(clearBtn); tb.addSeparator(); tb.add(netBtn); tb.addSeparator(); tb.add(counter);

        JTextArea editor = new JTextArea("// Type here — the keyboard works.\n// Drag the mouse on the right panel to draw.\n\npublic class Hello {\n    public static void main(String[] a) {\n        System.out.println(\"Hello from wasm Swing\");\n    }\n}\n");
        editor.setFont(new Font(Font.MONOSPACED, Font.PLAIN, 16));
        editor.setBorder(BorderFactory.createEmptyBorder(8,8,8,8));
        clearBtn.addActionListener(e -> { editor.setText(""); editor.requestFocusInWindow(); });

        ScribblePanel scribble = new ScribblePanel(status);

        JSplitPane split = new JSplitPane(JSplitPane.HORIZONTAL_SPLIT,
                new JScrollPane(editor), scribble);
        split.setResizeWeight(0.55);

        JPanel root = new JPanel(new BorderLayout());
        root.add(tb, BorderLayout.NORTH);
        root.add(split, BorderLayout.CENTER);
        root.add(status, BorderLayout.SOUTH);
        f.setContentPane(root);
        f.setVisible(true);
        editor.requestFocusInWindow();
        System.out.println("[DemoSwing] window shown");

        // Optional self-test: -Ddemo.autoFetch=1 clicks Fetch on startup so the
        // network path can be verified headlessly (and confirms it end-to-end).
        if ("1".equals(System.getProperty("demo.autoFetch"))) {
            javax.swing.Timer t = new javax.swing.Timer(1200, ev -> netBtn.doClick());
            t.setRepeats(false); t.start();
        }
    }

    static String hostOf(String url) {
        try { String h = new URI(url).getHost(); return h != null ? h : url; } catch (Exception e) { return url; }
    }

    /** Blocking HTTP GET (call off the EDT). Returns a one-line confirmation with
     *  the status line, byte count, and a snippet — proof the JVM reached the net. */
    static String fetchSite(String url) throws IOException, URISyntaxException {
        // Raw socket HTTP/1.0 (Connection: close) — the simplest possible path:
        // send a GET, then read the socket to EOF. Avoids HttpURLConnection's
        // keep-alive/connection-pool machinery entirely.
        URI u = new URI(url);
        String host = u.getHost();
        int port = u.getPort() > 0 ? u.getPort() : 80;
        String path = (u.getRawPath() == null || u.getRawPath().isEmpty()) ? "/" : u.getRawPath();
        System.out.println("[fetch] connecting " + host + ":" + port);
        byte[] resp;
        try (Socket sock = new Socket()) {
            sock.connect(new InetSocketAddress(host, port), 8000);
            sock.setSoTimeout(8000);
            System.out.println("[fetch] connected, sending request");
            String req = "GET " + path + " HTTP/1.0\r\nHost: " + host + "\r\n"
                       + "User-Agent: wasm-jvm-demo\r\nConnection: close\r\n\r\n";
            OutputStream os = sock.getOutputStream();
            os.write(req.getBytes("UTF-8")); os.flush();
            System.out.println("[fetch] request sent, reading to EOF…");
            InputStream in = sock.getInputStream();
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            byte[] buf = new byte[4096]; int n, total = 0;
            while ((n = in.read(buf)) > 0 && total < 262144) { bos.write(buf, 0, n); total += n; }
            resp = bos.toByteArray();
        }
        System.out.println("[fetch] read " + resp.length + " bytes total");
        String text = new String(resp, "UTF-8");
        int sep = text.indexOf("\r\n\r\n");
        String statusLine = text.contains("\r\n") ? text.substring(0, text.indexOf("\r\n")) : text;
        String bodyStr = sep >= 0 ? text.substring(sep + 4) : text;
        String snippet = bodyStr.replaceAll("\\s+", " ").trim();
        snippet = snippet.substring(0, Math.min(snippet.length(), 90));
        System.out.println("[DemoSwing] fetched " + url + " -> " + statusLine + " (" + resp.length + " bytes)");
        return statusLine + " — " + resp.length + " bytes from " + host + "  ·  \"" + snippet + "…\"";
    }

    static class ScribblePanel extends JPanel {
        final List<int[]> pts = new ArrayList<>();
        int lastX = -1, lastY = -1;
        ScribblePanel(JLabel status) {
            setBackground(Color.WHITE);
            MouseAdapter ma = new MouseAdapter() {
                public void mousePressed(MouseEvent e){ lastX=e.getX(); lastY=e.getY(); status.setText("draw @ "+e.getX()+","+e.getY()); }
                public void mouseDragged(MouseEvent e){ pts.add(new int[]{lastX,lastY,e.getX(),e.getY()}); lastX=e.getX(); lastY=e.getY(); repaint(); status.setText("draw @ "+e.getX()+","+e.getY()); }
            };
            addMouseListener(ma); addMouseMotionListener(ma);
        }
        protected void paintComponent(Graphics g){
            super.paintComponent(g);
            Graphics2D g2=(Graphics2D)g; g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
            g2.setColor(new Color(120,120,130)); g2.drawString("Scribble area — drag to draw", 14, 22);
            g2.setColor(new Color(30,90,220)); g2.setStroke(new BasicStroke(2.5f));
            for(int[] p: pts) g2.drawLine(p[0],p[1],p[2],p[3]);
        }
    }
}
