/* Copyright (c) 2025, Oracle and/or its affiliates. Classpath-exception-2.0. */
package sun.awt;

import java.awt.Component;
import java.awt.Window;

/** Trivial focus-manager peer: a single virtual screen has one focused window/owner. */
public final class WasmKeyboardFocusManagerPeer extends KeyboardFocusManagerPeerImpl {
    private static final WasmKeyboardFocusManagerPeer INSTANCE = new WasmKeyboardFocusManagerPeer();
    private volatile Window focusedWindow;
    private volatile Component focusOwner;

    public static WasmKeyboardFocusManagerPeer getInstance() { return INSTANCE; }

    @Override public void setCurrentFocusedWindow(Window win) { focusedWindow = win; }
    @Override public Window getCurrentFocusedWindow() { return focusedWindow; }
    @Override public void setCurrentFocusOwner(Component comp) { focusOwner = comp; }
    @Override public Component getCurrentFocusOwner() { return focusOwner; }
}
