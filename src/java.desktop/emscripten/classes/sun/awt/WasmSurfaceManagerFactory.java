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

import sun.awt.image.BufImgVolatileSurfaceManager;
import sun.awt.image.SunVolatileImage;
import sun.awt.image.VolatileSurfaceManager;
import sun.java2d.SurfaceManagerFactory;

/**
 * SurfaceManagerFactory for the wasm target: there is no GPU-accelerated Java2D
 * pipeline, so every VolatileImage is backed by an unaccelerated BufferedImage
 * ({@link BufImgVolatileSurfaceManager}). Installing this lets Swing's
 * RepaintManager create the offscreen (volatile) double-buffers it needs, so the
 * real AWT/Swing paint pipeline runs into the virtual screen instead of throwing
 * "No SurfaceManagerFactory set".
 */
public final class WasmSurfaceManagerFactory extends SurfaceManagerFactory {

    @Override
    public VolatileSurfaceManager createVolatileManager(SunVolatileImage vImg,
                                                        Object context) {
        return new BufImgVolatileSurfaceManager(vImg, context);
    }
}
