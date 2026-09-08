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

import java.awt.GraphicsEnvironment;
import java.awt.Toolkit;

/**
 * Minimal headless platform hooks for the emscripten (wasm) target. The wasm
 * build is always headless and its real java.desktop classes are supplied at
 * runtime; this class exists so java.desktop compiles for header generation.
 */
public final class PlatformGraphicsInfo {

    public static GraphicsEnvironment createGE() {
        return null; // header-gen stub; boot java.desktop runs at runtime
    }

    public static Toolkit createToolkit() {
        throw new java.awt.HeadlessException();
    }

    public static boolean getDefaultHeadlessProperty() {
        return true;
    }

    public static String getDefaultHeadlessMessage() {
        return "\nThe wasm build of java.desktop is headless.";
    }
}
