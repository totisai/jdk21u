/*
 * Copyright (c) 2025, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 * This code is free software; you can redistribute it and/or modify it
 * under the terms of the GNU General Public License version 2 only, as
 * published by the Free Software Foundation.  Oracle designates this
 * particular file as subject to the "Classpath" exception as provided
 * by Oracle in the LICENSE file that accompanied this code.
 */
package com.sun.java.swing.plaf.windows;

import javax.swing.plaf.metal.MetalLookAndFeel;

/**
 * Compatibility shim for {@code com.sun.java.swing.plaf.windows.WindowsLookAndFeel},
 * which only ships in the Windows build of java.desktop and is therefore absent on
 * this (bsd/emscripten-derived) target. Some older applications reference the class
 * unconditionally -- e.g. IntelliJ IDEA 2018.2's {@code IdeaLaf} uses it purely as a
 * resource anchor for tree icons ({@code LookAndFeel.makeIcon(WindowsLookAndFeel.class,
 * "icons/TreeOpen.gif")}) -- and fail with NoClassDefFoundError when it is missing.
 *
 * Backing it with the cross-platform Metal look and feel keeps it a valid, usable
 * LookAndFeel; the Windows-only icon resources simply aren't present, so those icons
 * degrade gracefully to empty (makeIcon tolerates a missing resource).
 */
public class WindowsLookAndFeel extends MetalLookAndFeel {

    @Override
    public String getID() {
        return "Windows";
    }

    @Override
    public String getName() {
        return "Windows";
    }

    @Override
    public String getDescription() {
        return "The Windows Look and Feel (compatibility shim backed by Metal)";
    }

    @Override
    public boolean isNativeLookAndFeel() {
        return false;
    }

    @Override
    public boolean isSupportedLookAndFeel() {
        return true;
    }
}
