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

import java.awt.GraphicsDevice;
import sun.java2d.SunGraphicsEnvironment;
import sun.java2d.SurfaceManagerFactory;

/**
 * A non-headless {@link SunGraphicsEnvironment} for the wasm target, backed by a
 * single virtual screen. This lets real top-level windows (JFrame) be created;
 * their peers render into an offscreen buffer that the browser blits to a canvas.
 * Offscreen BufferedImage rendering continues to work via the base createGraphics.
 */
public final class WasmGraphicsEnvironment extends SunGraphicsEnvironment {

    // Install the software (BufferedImage-backed) volatile surface manager, so
    // Swing's RepaintManager can create offscreen double-buffers and the real
    // paint pipeline runs (else VolatileImage creation throws). The platform
    // GraphicsEnvironments do the equivalent in their static initializers.
    static {
        try { SurfaceManagerFactory.setInstance(new WasmSurfaceManagerFactory()); }
        catch (IllegalStateException alreadySet) { }
    }

    // Virtual screen size. Defaults to 1024x768 but is overridable at launch via
    // -Dsun.java2d.wasm.screenWidth/Height so the browser can size the JVM's screen
    // to the actual viewport (e.g. a full 2K window).
    public static final int SCREEN_W = intProp("sun.java2d.wasm.screenWidth", 1024);
    public static final int SCREEN_H = intProp("sun.java2d.wasm.screenHeight", 768);

    private static int intProp(String key, int def) {
        try {
            String v = System.getProperty(key);
            if (v != null) return Math.max(64, Math.min(8192, Integer.parseInt(v.trim())));
        } catch (Exception e) { }
        return def;
    }

    @Override
    protected int getNumScreens() { return 1; }

    @Override
    protected GraphicsDevice makeScreenDevice(int screennum) {
        return new WasmGraphicsDevice(SCREEN_W, SCREEN_H);
    }

    @Override
    public boolean isDisplayLocal() { return true; }

    @Override
    public void displayChanged() { }

    @Override
    public void paletteChanged() { }
}
