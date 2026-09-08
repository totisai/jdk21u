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
import java.awt.datatransfer.Clipboard;
import java.awt.dnd.DragGestureEvent;
import java.awt.dnd.peer.DragSourceContextPeer;
import java.awt.im.InputMethodHighlight;
import java.awt.image.ColorModel;
import java.awt.image.ImageObserver;
import java.awt.image.ImageProducer;
import java.awt.font.TextAttribute;
import java.awt.peer.*;
import java.net.URL;
import java.util.Collections;
import java.util.Map;
import java.util.Properties;

import sun.awt.datatransfer.DataTransferer;

/**
 * A minimal but *real* {@link SunToolkit} for the wasm target: enough for real
 * top-level windows rendered into an offscreen buffer (the browser blits it to a
 * canvas). Display metrics come from the virtual screen; window peers are created
 * by {@link #createFrame}/{@link #createWindow}. Tray/print/clipboard/DnD are not
 * supported.
 */
public final class WasmToolkit extends SunToolkit {

    private final EventQueue eventQueue = new EventQueue();

    // ---- SunToolkit abstract methods ----
    @Override public FramePeer createLightweightFrame(LightweightFrame target) {
        throw new UnsupportedOperationException("lightweight frame");
    }
    @Override public TrayIconPeer createTrayIcon(TrayIcon target) { throw new HeadlessException(); }
    @Override public SystemTrayPeer createSystemTray(SystemTray tray) { throw new HeadlessException(); }
    @Override public boolean isTraySupported() { return false; }
    @Override public KeyboardFocusManagerPeer getKeyboardFocusManagerPeer() {
        return WasmKeyboardFocusManagerPeer.getInstance();
    }
    @Override protected boolean syncNativeQueue(long timeout) { return false; }
    @Override public void grab(Window w) { }
    @Override public void ungrab(Window w) { }
    @Override public boolean isDesktopSupported() { return false; }
    @Override public boolean isTaskbarSupported() { return false; }

    // ---- window/component peers ----
    @Override public FramePeer createFrame(Frame target) { return new WasmWindowPeer(target); }
    @Override public WindowPeer createWindow(Window target) { return new WasmWindowPeer(target); }
    // Dialogs (JDialog / modal dialogs) — same virtual-screen peer as frames.
    // Without this the ComponentFactory default createDialog throws HeadlessException.
    @Override public DialogPeer createDialog(Dialog target) { return new WasmWindowPeer(target); }

    // ---- remaining Toolkit abstract methods ----
    @Override public int getScreenResolution() { return 96; }
    @Override public void sync() { }
    // Image loading via ImageIO (pure-Java PNG/GIF/BMP readers). Returns a fully
    // decoded BufferedImage (an Image) synchronously; a null decode yields null.
    // Results are cached per source, matching Toolkit.getImage semantics.
    private final java.util.Map<Object, Image> imgCache = new java.util.concurrent.ConcurrentHashMap<>();
    private static Image decode(java.io.InputStream in) {
        if (in == null) return null;
        try (java.io.InputStream s = in) { return javax.imageio.ImageIO.read(s); }
        catch (Throwable t) { return null; }
    }
    @Override public Image getImage(String filename) {
        return imgCache.computeIfAbsent("f:" + filename, k -> {
            try { return decode(new java.io.FileInputStream(filename)); } catch (Throwable t) { return null; } });
    }
    @Override public Image getImage(URL url) {
        if (url == null) return null;
        return imgCache.computeIfAbsent("u:" + url, k -> { try { return decode(url.openStream()); } catch (Throwable t) { return null; } });
    }
    @Override public Image createImage(String filename) {
        try { return decode(new java.io.FileInputStream(filename)); } catch (Throwable t) { return null; }
    }
    @Override public Image createImage(URL url) {
        try { return url == null ? null : decode(url.openStream()); } catch (Throwable t) { return null; }
    }
    @Override public Image createImage(ImageProducer producer) {
        // Grab the producer's pixels synchronously into a BufferedImage (handles
        // FilteredImageSource -> disabled icons etc.). Avoids the async
        // ToolkitImage/SurfaceData path, which has no backing here.
        try {
            final int[] dim = new int[2];
            final int[][] buf = new int[1][];
            final boolean[] done = { false };
            java.awt.image.ImageConsumer ic = new java.awt.image.ImageConsumer() {
                public void setDimensions(int w, int h) { dim[0]=w; dim[1]=h; if (w>0 && h>0) buf[0]=new int[w*h]; }
                public void setProperties(java.util.Hashtable<?,?> p) { }
                public void setColorModel(ColorModel m) { }
                public void setHints(int h) { }
                public void setPixels(int x,int y,int w,int h, ColorModel cm, byte[] px,int off,int scan) {
                    int[] b=buf[0]; if (b==null) return; int iw=dim[0];
                    for (int r=0;r<h;r++) for (int c=0;c<w;c++) b[(y+r)*iw+(x+c)] = cm.getRGB(px[off+r*scan+c]&0xff);
                }
                public void setPixels(int x,int y,int w,int h, ColorModel cm, int[] px,int off,int scan) {
                    int[] b=buf[0]; if (b==null) return; int iw=dim[0];
                    for (int r=0;r<h;r++) for (int c=0;c<w;c++) b[(y+r)*iw+(x+c)] = cm.getRGB(px[off+r*scan+c]);
                }
                public void imageComplete(int status) { done[0]=true; producer.removeConsumer(this); }
            };
            producer.startProduction(ic);     // synchronous for Memory/FilteredImageSource
            if (!done[0] || buf[0]==null || dim[0]<=0 || dim[1]<=0) return null;
            java.awt.image.BufferedImage bi =
                new java.awt.image.BufferedImage(dim[0], dim[1], java.awt.image.BufferedImage.TYPE_INT_ARGB);
            bi.setRGB(0, 0, dim[0], dim[1], buf[0], 0, dim[0]);
            return bi;
        } catch (Throwable t) { return null; }
    }
    @Override public Image createImage(byte[] data, int off, int len) {
        return decode(new java.io.ByteArrayInputStream(data, off, len));
    }
    // ImageIO images are fully decoded already; report complete so MediaTracker /
    // prepareImage callers proceed immediately.
    @Override public boolean prepareImage(Image i, int w, int h, ImageObserver o) { return true; }
    @Override public int checkImage(Image i, int w, int h, ImageObserver o) {
        return ImageObserver.ALLBITS | ImageObserver.WIDTH | ImageObserver.HEIGHT;
    }
    @Override public PrintJob getPrintJob(Frame f, String title, Properties p) { return null; }
    @Override public void beep() { }
    @Override public Clipboard getSystemClipboard() { throw new HeadlessException(); }
    @Override public boolean isModalExclusionTypeSupported(Dialog.ModalExclusionType t) { return false; }
    @Override public String[] getFontList() {
        return new String[]{ Font.DIALOG, Font.SANS_SERIF, Font.SERIF, Font.MONOSPACED, Font.DIALOG_INPUT };
    }
    @Override public Map<TextAttribute, ?> mapInputMethodHighlight(InputMethodHighlight h) {
        return Collections.emptyMap();
    }

    // ---- InputMethodSupport (via SunToolkit) ----
    @Override public java.awt.im.spi.InputMethodDescriptor getInputMethodAdapterDescriptor() { return null; }

    // ---- DnD ----
    @Override public DragSourceContextPeer createDragSourceContextPeer(DragGestureEvent dge) {
        throw new UnsupportedOperationException("no DnD");
    }

    @Override protected EventQueue getSystemEventQueueImpl() { return eventQueue; }

    @Override public DataTransferer getDataTransferer() { return null; }
}
