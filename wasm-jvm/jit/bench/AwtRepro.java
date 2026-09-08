// Headless repro for the _fast_iload-unmasked AWT miscompile. The browser crash
// (javaCalls.cpp:473) came from the continuous Swing PAINT/layout path once _fast_iload
// made those methods JIT-eligible. Painting a panel + children to a BufferedImage
// exercises exactly that path (JComponent.paint/paintChildren, Basic*UI, SwingUtilities2
// drawString -> sun.font char[] fused-iload) WITHOUT needing a display or EDT pump.
import javax.swing.*;
import java.awt.*;
import java.awt.image.*;
public class AwtRepro {
  public static void main(String[] a) throws Exception {
    JPanel p = new JPanel(new FlowLayout());
    JButton b = new JButton("Click me");
    JLabel  l = new JLabel("Clicks: 0");
    JTextArea t = new JTextArea("public class Hello {\n  static void main(){}\n}");
    p.add(b); p.add(l); p.add(t);
    p.setSize(600, 120);
    BufferedImage img = new BufferedImage(600, 120, BufferedImage.TYPE_INT_ARGB);
    System.out.println("[AwtRepro] painting x N ...");
    for (int i = 0; i < 4000; i++) {
      l.setText("Clicks: " + i + "  value=" + (i * 31 ^ (i >> 2)));
      p.doLayout();
      Graphics2D g = img.createGraphics();
      p.paint(g);
      g.dispose();
      if ((i & 1023) == 0) System.out.println("  paint " + i);
    }
    System.out.println("done label=" + l.getText());
    System.out.println("ALL PASS");
  }
}
