import java.awt.*;
import java.awt.font.*;
import java.awt.geom.*;
import java.awt.image.*;
import java.awt.image.renderable.RenderableImage;
import java.text.AttributedCharacterIterator;
import java.util.Map;

/**
 * A Graphics2D that records drawing primitives into a shared binary command buffer
 * instead of rasterizing into a BufferedImage. The page reads the buffer and replays
 * each op onto a CanvasRenderingContext2D -- so Java2D fills/lines/text become NATIVE,
 * GPU-composited Canvas 2D calls rather than the interpreted software rasterizer.
 *
 * Path A ("trust Java2D"): getFontMetrics/getFontRenderContext delegate to a real (1x1
 * BufferedImage) Graphics2D so Swing's layout still works; we don't match the browser's
 * text metrics, so text may sit a few px off. Coordinates are emitted in USER space and
 * the ctx transform is set to match g's AffineTransform, so the browser applies it.
 *
 * Command protocol (little-endian; ints=i32, floats=f32; strings=[len:i32][utf8]):
 *   01 SAVE   02 RESTORE   03 RESETCLIP x,y,w,h
 *   10 COLOR rgba(4B)  11 FONT style,size,[name]  12 ALPHA a  13 LINEW w  14 CLIP x,y,w,h  15 XFORM m00,m10,m01,m11,m02,m12(f32)
 *   20 FILLRECT  21 DRAWRECT  22 DRAWLINE x1,y1,x2,y2  23 FILLROUND x,y,w,h,aw,ah  24 DRAWROUND …  25 FILLOVAL  26 DRAWOVAL  27 CLEARRECT
 *   30 STRING x,y,[str]
 *   40 PBEGIN 41 PMOVE x,y(f) 42 PLINE 43 PQUAD cx,cy,x,y 44 PCUBIC c1..,x,y 45 PCLOSE 46 PFILL 47 PSTROKE
 */
public final class CmdGraphics2D extends Graphics2D {

    // ---- shared recording state (one per frame, shared by create() children) ----
    static final class Rec {
        final java.nio.ByteBuffer buf;
        final Graphics2D metricsG;      // real Java2D graphics, for metrics/FRC only
        int lastRGBA = -1;              // dedup: last emitted color/font/xform/clip
        String lastFontKey = null;
        double[] lastXform = null;
        int lc_x, lc_y, lc_w = -1, lc_h;   // last clip; w<0 = unknown
        Rec(java.nio.ByteBuffer b, Graphics2D m) { buf = b; metricsG = m; }
        void op(int o) { buf.put((byte) o); }
        void i(int v) { buf.putInt(v); }
        void f(double v) { buf.putFloat((float) v); }
        void str(String s) { byte[] b = s.getBytes(java.nio.charset.StandardCharsets.UTF_8); buf.putInt(b.length); buf.put(b); }
        void invalidate() { lastRGBA = -1; lastFontKey = null; lastXform = null; lc_w = -1; }
    }

    private final Rec r;
    private Color color = Color.BLACK, bg = Color.WHITE;
    private Font font = new Font("SansSerif", Font.PLAIN, 12);
    private final AffineTransform xform;
    private Rectangle clip;             // device-space (post-transform) clip bounds, or null
    private Stroke stroke = new BasicStroke(1f);
    private Composite composite = AlphaComposite.SrcOver;
    private final RenderingHints hints = new RenderingHints(null);

    /** Root graphics for a frame: caller has already emitted RESETCLIP for the dirty rect. */
    public CmdGraphics2D(java.nio.ByteBuffer buf, Graphics2D metricsG, int cx, int cy, int cw, int ch) {
        this.r = new Rec(buf, metricsG);
        this.xform = new AffineTransform();
        this.clip = new Rectangle(cx, cy, cw, ch);
        // The page applied RESETCLIP(cx,cy,cw,ch) -> identity transform + this clip; seed
        // the dedup so a child that changes them re-emits, but the root doesn't redundantly.
        r.lastXform = new double[]{1, 0, 0, 1, 0, 0};
        r.lc_x = cx; r.lc_y = cy; r.lc_w = cw; r.lc_h = ch;
    }
    private CmdGraphics2D(CmdGraphics2D p) {           // create(): inherit state, share Rec
        this.r = p.r; this.color = p.color; this.bg = p.bg; this.font = p.font;
        this.xform = new AffineTransform(p.xform); this.clip = (p.clip == null ? null : new Rectangle(p.clip));
        this.stroke = p.stroke; this.composite = p.composite;
    }

    // ---- state sync: emit color/font/xform/clip before a draw only if changed ----
    private void sync() {
        int rgba = (color.getRed() << 24) | (color.getGreen() << 16) | (color.getBlue() << 8) | color.getAlpha();
        if (rgba != r.lastRGBA) { r.op(0x10); r.i(rgba); r.lastRGBA = rgba; }
        String fk = font.getName() + "|" + font.getStyle() + "|" + font.getSize();
        if (!fk.equals(r.lastFontKey)) { r.op(0x11); r.i(font.getStyle()); r.i(font.getSize()); r.str(font.getName()); r.lastFontKey = fk; }
        double[] m = new double[6]; xform.getMatrix(m);
        if (r.lastXform == null || !java.util.Arrays.equals(m, r.lastXform)) {
            r.op(0x15); for (double v : m) r.f(v); r.lastXform = m.clone();
        }
        if (clip != null && (r.lc_w < 0 || clip.x != r.lc_x || clip.y != r.lc_y || clip.width != r.lc_w || clip.height != r.lc_h)) {
            r.op(0x14); r.i(clip.x); r.i(clip.y); r.i(clip.width); r.i(clip.height);
            r.lc_x = clip.x; r.lc_y = clip.y; r.lc_w = clip.width; r.lc_h = clip.height;
        }
    }
    private int strokeW() { return (stroke instanceof BasicStroke) ? Math.max(1, Math.round(((BasicStroke) stroke).getLineWidth())) : 1; }

    // ---- drawing (emit commands) ----
    public void fillRect(int x, int y, int w, int h) { sync(); r.op(0x20); r.i(x); r.i(y); r.i(w); r.i(h); }
    public void drawRect(int x, int y, int w, int h) { sync(); r.op(0x13); r.i(strokeW()); r.op(0x21); r.i(x); r.i(y); r.i(w); r.i(h); }
    public void drawLine(int x1, int y1, int x2, int y2) { sync(); r.op(0x13); r.i(strokeW()); r.op(0x22); r.i(x1); r.i(y1); r.i(x2); r.i(y2); }
    public void clearRect(int x, int y, int w, int h) { Color c = color; setColor(bg); sync(); r.op(0x20); r.i(x); r.i(y); r.i(w); r.i(h); setColor(c); }
    public void fillRoundRect(int x, int y, int w, int h, int aw, int ah) { sync(); r.op(0x23); r.i(x); r.i(y); r.i(w); r.i(h); r.i(aw); r.i(ah); }
    public void drawRoundRect(int x, int y, int w, int h, int aw, int ah) { sync(); r.op(0x13); r.i(strokeW()); r.op(0x24); r.i(x); r.i(y); r.i(w); r.i(h); r.i(aw); r.i(ah); }
    public void fillOval(int x, int y, int w, int h) { sync(); r.op(0x25); r.i(x); r.i(y); r.i(w); r.i(h); }
    public void drawOval(int x, int y, int w, int h) { sync(); r.op(0x13); r.i(strokeW()); r.op(0x26); r.i(x); r.i(y); r.i(w); r.i(h); }
    public void drawString(String s, int x, int y) { if (s == null || s.isEmpty()) return; sync(); r.op(0x30); r.i(x); r.i(y); r.str(s); }
    public void drawString(String s, float x, float y) { drawString(s, Math.round(x), Math.round(y)); }
    public void drawString(AttributedCharacterIterator it, int x, int y) { drawString(iterToStr(it), x, y); }
    public void drawString(AttributedCharacterIterator it, float x, float y) { drawString(iterToStr(it), Math.round(x), Math.round(y)); }
    private static String iterToStr(AttributedCharacterIterator it) { StringBuilder b = new StringBuilder(); for (char c = it.first(); c != AttributedCharacterIterator.DONE; c = it.next()) b.append(c); return b.toString(); }

    private void emitPath(PathIterator pi, boolean fill) {
        sync(); if (!fill) { r.op(0x13); r.i(strokeW()); }
        r.op(0x40); double[] c = new double[6];
        while (!pi.isDone()) {
            switch (pi.currentSegment(c)) {
                case PathIterator.SEG_MOVETO:  r.op(0x41); r.f(c[0]); r.f(c[1]); break;
                case PathIterator.SEG_LINETO:  r.op(0x42); r.f(c[0]); r.f(c[1]); break;
                case PathIterator.SEG_QUADTO:  r.op(0x43); r.f(c[0]); r.f(c[1]); r.f(c[2]); r.f(c[3]); break;
                case PathIterator.SEG_CUBICTO: r.op(0x44); r.f(c[0]); r.f(c[1]); r.f(c[2]); r.f(c[3]); r.f(c[4]); r.f(c[5]); break;
                case PathIterator.SEG_CLOSE:   r.op(0x45); break;
            }
            pi.next();
        }
        r.op(fill ? 0x46 : 0x47);
    }
    public void fill(Shape s) { if (s instanceof Rectangle) { Rectangle b = (Rectangle) s; fillRect(b.x, b.y, b.width, b.height); return; } emitPath(s.getPathIterator(null), true); }
    public void draw(Shape s) { if (s instanceof Rectangle) { Rectangle b = (Rectangle) s; drawRect(b.x, b.y, b.width, b.height); return; } emitPath(s.getPathIterator(null), false); }
    public void drawPolyline(int[] xp, int[] yp, int n) { if (n <= 0) return; sync(); r.op(0x13); r.i(strokeW()); r.op(0x40); r.op(0x41); r.f(xp[0]); r.f(yp[0]); for (int i = 1; i < n; i++) { r.op(0x42); r.f(xp[i]); r.f(yp[i]); } r.op(0x47); }
    public void drawPolygon(int[] xp, int[] yp, int n) { if (n <= 0) return; sync(); r.op(0x13); r.i(strokeW()); r.op(0x40); r.op(0x41); r.f(xp[0]); r.f(yp[0]); for (int i = 1; i < n; i++) { r.op(0x42); r.f(xp[i]); r.f(yp[i]); } r.op(0x45); r.op(0x47); }
    public void fillPolygon(int[] xp, int[] yp, int n) { if (n <= 0) return; sync(); r.op(0x40); r.op(0x41); r.f(xp[0]); r.f(yp[0]); for (int i = 1; i < n; i++) { r.op(0x42); r.f(xp[i]); r.f(yp[i]); } r.op(0x45); r.op(0x46); }
    public void drawArc(int x, int y, int w, int h, int a, int e) { drawOval(x, y, w, h); }   // approx (rare)
    public void fillArc(int x, int y, int w, int h, int a, int e) { fillOval(x, y, w, h); }

    // ---- images: not bridged yet (path A). Return true so callers proceed. ----
    public boolean drawImage(Image img, int x, int y, ImageObserver o) { return true; }
    public boolean drawImage(Image img, int x, int y, int w, int h, ImageObserver o) { return true; }
    public boolean drawImage(Image img, int x, int y, Color b, ImageObserver o) { return true; }
    public boolean drawImage(Image img, int x, int y, int w, int h, Color b, ImageObserver o) { return true; }
    public boolean drawImage(Image img, int dx1, int dy1, int dx2, int dy2, int sx1, int sy1, int sx2, int sy2, ImageObserver o) { return true; }
    public boolean drawImage(Image img, int dx1, int dy1, int dx2, int dy2, int sx1, int sy1, int sx2, int sy2, Color b, ImageObserver o) { return true; }
    public boolean drawImage(Image img, AffineTransform xf, ImageObserver o) { return true; }
    public void drawImage(BufferedImage img, BufferedImageOp op, int x, int y) {}
    public void drawRenderedImage(RenderedImage img, AffineTransform xf) {}
    public void drawRenderableImage(RenderableImage img, AffineTransform xf) {}
    public void drawGlyphVector(GlyphVector g, float x, float y) { fill(g.getOutline(x, y)); }
    public void copyArea(int x, int y, int w, int h, int dx, int dy) {}

    // ---- state ----
    public Color getColor() { return color; }
    public void setColor(Color c) { if (c != null) color = c; }
    public void setBackground(Color c) { bg = c; }
    public Color getBackground() { return bg; }
    public Font getFont() { return font; }
    public void setFont(Font f) { if (f != null) font = f; }
    public void setPaintMode() {}
    public void setXORMode(Color c) {}
    public Paint getPaint() { return color; }
    public void setPaint(Paint p) { if (p instanceof Color) color = (Color) p; }
    public Composite getComposite() { return composite; }
    public void setComposite(Composite c) { composite = c; }
    public Stroke getStroke() { return stroke; }
    public void setStroke(Stroke s) { stroke = s; }

    public void translate(int x, int y) { xform.translate(x, y); if (clip != null) clip.translate(-x, -y); }
    public void translate(double x, double y) { xform.translate(x, y); }
    public void rotate(double t) { xform.rotate(t); }
    public void rotate(double t, double x, double y) { xform.rotate(t, x, y); }
    public void scale(double sx, double sy) { xform.scale(sx, sy); }
    public void shear(double sx, double sy) { xform.shear(sx, sy); }
    public void transform(AffineTransform t) { xform.concatenate(t); }
    public void setTransform(AffineTransform t) { xform.setTransform(t); }
    public AffineTransform getTransform() { return new AffineTransform(xform); }

    public Rectangle getClipBounds() { return clip == null ? null : new Rectangle(clip); }
    public Shape getClip() { return clip == null ? null : new Rectangle(clip); }
    public void clipRect(int x, int y, int w, int h) { Rectangle nr = new Rectangle(x, y, w, h); clip = (clip == null) ? nr : clip.intersection(nr); }
    public void setClip(int x, int y, int w, int h) { clip = new Rectangle(x, y, w, h); }
    public void setClip(Shape s) { clip = (s == null) ? null : s.getBounds(); }
    public void clip(Shape s) { if (s != null) { Rectangle b = s.getBounds(); clip = (clip == null) ? b : clip.intersection(b); } }

    // ---- create / dispose -> ctx save/restore ----
    public Graphics create() { r.op(0x01); return new CmdGraphics2D(this); }
    public void dispose() { r.op(0x02); r.invalidate(); }

    // ---- metrics / config: delegate to a real Java2D graphics (path A) ----
    public FontMetrics getFontMetrics(Font f) { return r.metricsG.getFontMetrics(f); }
    public FontRenderContext getFontRenderContext() { return r.metricsG.getFontRenderContext(); }
    public GraphicsConfiguration getDeviceConfiguration() { return r.metricsG.getDeviceConfiguration(); }

    // ---- rendering hints: accepted but ignored (Canvas handles AA natively) ----
    public void setRenderingHint(RenderingHints.Key k, Object v) { hints.put(k, v); }
    public Object getRenderingHint(RenderingHints.Key k) { return hints.get(k); }
    public void setRenderingHints(Map<?, ?> h) { hints.clear(); hints.putAll(h); }
    public void addRenderingHints(Map<?, ?> h) { hints.putAll(h); }
    public RenderingHints getRenderingHints() { return (RenderingHints) hints.clone(); }
    public boolean hit(Rectangle rect, Shape s, boolean onStroke) { return s.intersects(rect); }
}
