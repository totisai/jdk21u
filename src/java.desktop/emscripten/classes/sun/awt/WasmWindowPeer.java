/*
 * Copyright (c) 2025, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 * This code is free software; you can redistribute it and/or modify it
 * under the terms of the GNU General Public License version 2 only, as
 * published by the Free Software Foundation.  Oracle designates this
 * particular file as subject to the "Classpath" exception as provided
 * by Oracle in the LICENSE file that accompanied this code.
 */
package sun.awt;

import java.awt.*;
import java.awt.event.FocusEvent.Cause;
import java.awt.event.PaintEvent;
import java.awt.image.BufferedImage;
import java.awt.image.ColorModel;
import java.awt.image.VolatileImage;
import java.awt.peer.ComponentPeer;
import java.awt.peer.ContainerPeer;
import java.awt.peer.DialogPeer;
import java.awt.peer.FramePeer;
import java.util.List;

import sun.java2d.pipe.Region;

/**
 * A real top-level window peer for the wasm target. All windows composite into a
 * single shared "screen" BufferedImage (the virtual display); the browser blits
 * that image to a canvas. {@link #getGraphics} hands Swing a Graphics into the
 * screen at the window's location, so the genuine AWT/Swing paint pipeline runs.
 * Most native operations are no-ops (there is no OS window).
 */
public final class WasmWindowPeer implements FramePeer, DialogPeer {

    /** The single virtual screen shared by all windows. */
    private static BufferedImage screen;
    public static synchronized BufferedImage screen() {
        if (screen == null) {
            screen = new BufferedImage(WasmGraphicsEnvironment.SCREEN_W,
                                       WasmGraphicsEnvironment.SCREEN_H,
                                       BufferedImage.TYPE_INT_RGB);
        }
        return screen;
    }

    private final Window target;
    private Rectangle bounds;

    WasmWindowPeer(Window target) {
        this.target = target;
        this.bounds = target.getBounds();
        if (bounds.width <= 0)  bounds.width = 200;
        if (bounds.height <= 0) bounds.height = 150;
    }

    // ---- the parts that matter: graphics into the shared screen ----
    @Override public Graphics getGraphics() {
        Graphics2D g = screen().createGraphics();
        g.translate(bounds.x, bounds.y);
        g.setClip(0, 0, bounds.width, bounds.height);
        return g;
    }
    @Override public GraphicsConfiguration getGraphicsConfiguration() {
        return GraphicsEnvironment.getLocalGraphicsEnvironment()
                 .getDefaultScreenDevice().getDefaultConfiguration();
    }
    @Override public ColorModel getColorModel() { return ColorModel.getRGBdefault(); }
    @Override public Point getLocationOnScreen() { return new Point(bounds.x, bounds.y); }
    public Rectangle getBounds() { return new Rectangle(bounds); }
    @Override public void setBounds(int x, int y, int w, int h, int op) {
        bounds = new Rectangle(x, y, Math.max(1, w), Math.max(1, h));
    }
    @Override public Insets getInsets() { return new Insets(0, 0, 0, 0); }
    @Override public boolean isFocusable() { return true; }
    @Override public boolean requestFocus(Component lightweightChild, boolean temporary,
                                          boolean focusedWindowChangeAllowed, long time, Cause cause) {
        return true;
    }
    @Override public Image createImage(int w, int h) {
        return new BufferedImage(Math.max(1, w), Math.max(1, h), BufferedImage.TYPE_INT_ARGB);
    }
    @Override public VolatileImage createVolatileImage(int w, int h) { return null; }
    @Override public FontMetrics getFontMetrics(Font font) { return sun.font.FontDesignMetrics.getMetrics(font); }

    // ---- ComponentPeer no-ops ----
    @Override public boolean isObscured() { return false; }
    @Override public boolean canDetermineObscurity() { return false; }
    @Override public void setVisible(boolean b) { if (b) postPaint(); }
    /** Post a full-window PaintEvent to the EDT (no OS to send expose events);
     *  the EDT paints the window into the shared screen buffer via getGraphics(). */
    private void postPaint() {
        Toolkit.getDefaultToolkit().getSystemEventQueue().postEvent(
            new PaintEvent(target, PaintEvent.PAINT, new Rectangle(0, 0, bounds.width, bounds.height)));
    }
    public void repaint(long tm, int x, int y, int w, int h) { postPaint(); }
    @Override public void setEnabled(boolean b) { }
    @Override public void paint(Graphics g) { }
    @Override public void print(Graphics g) { }
    @Override public void coalescePaintEvent(PaintEvent e) { }
    @Override public void handleEvent(AWTEvent e) { }
    @Override public Dimension getPreferredSize() { return bounds.getSize(); }
    @Override public Dimension getMinimumSize() { return new Dimension(1, 1); }
    @Override public void setForeground(Color c) { }
    @Override public void setBackground(Color c) { }
    @Override public void setFont(Font f) { }
    @Override public void updateCursorImmediately() { }
    @Override public void dispose() { }
    @Override public boolean isReparentSupported() { return false; }
    @Override public void reparent(ContainerPeer p) { throw new UnsupportedOperationException(); }
    @Override public void layout() { }
    @Override public void applyShape(Region shape) { }
    @Override public void setZOrder(ComponentPeer above) { }
    @Override public boolean updateGraphicsData(GraphicsConfiguration gc) { return false; }
    public GraphicsConfiguration getAppropriateGraphicsConfiguration(GraphicsConfiguration gc) { return gc; }
    @Override public void repositionSecurityWarning() { }
    @Override public boolean handlesWheelScrolling() { return false; }
    @Override public void createBuffers(int n, BufferCapabilities caps) throws AWTException { }
    @Override public Image getBackBuffer() { throw new IllegalStateException("no buffers"); }
    @Override public void flip(int x1, int y1, int x2, int y2, BufferCapabilities.FlipContents f) { }
    @Override public void destroyBuffers() { }

    // ---- ContainerPeer ----
    @Override public void beginValidate() { }
    @Override public void endValidate() { }
    @Override public void beginLayout() { }
    @Override public void endLayout() { }

    // ---- WindowPeer ----
    @Override public void toFront() { }
    @Override public void toBack() { }
    @Override public void updateAlwaysOnTopState() { }
    @Override public void updateFocusableWindowState() { }
    @Override public void setModalBlocked(Dialog blocker, boolean blocked) { }
    @Override public void updateMinimumSize() { }
    @Override public void updateIconImages() { }
    @Override public void setOpacity(float opacity) { }
    @Override public void setOpaque(boolean isOpaque) { }
    @Override public void updateWindow() { }

    // ---- FramePeer ----
    @Override public void setTitle(String title) { }
    @Override public void setMenuBar(MenuBar mb) { }
    @Override public void setResizable(boolean resizeable) { }
    @Override public void setState(int state) { }
    @Override public int getState() { return Frame.NORMAL; }
    @Override public void setMaximizedBounds(Rectangle bounds) { }
    @Override public void setBoundsPrivate(int x, int y, int w, int h) { setBounds(x, y, w, h, 0); }
    @Override public Rectangle getBoundsPrivate() { return getBounds(); }
    @Override public void emulateActivation(boolean activate) { }

    // ---- DialogPeer (Frame/Dialog share one peer here; setTitle/setResizable
    //      are inherited from the FramePeer methods above) ----
    @Override public void blockWindows(List<Window> windows) { }
}
