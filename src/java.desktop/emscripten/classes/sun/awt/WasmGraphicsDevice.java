/* Copyright (c) 2025, Oracle and/or its affiliates. Classpath-exception-2.0. */
package sun.awt;

import java.awt.GraphicsConfiguration;
import java.awt.GraphicsDevice;

/** A single virtual screen for the wasm target. */
public final class WasmGraphicsDevice extends GraphicsDevice {
    final int width, height;
    private final WasmGraphicsConfiguration cfg;

    WasmGraphicsDevice(int width, int height) {
        this.width = width; this.height = height;
        this.cfg = new WasmGraphicsConfiguration(this);
    }
    @Override public int getType() { return TYPE_RASTER_SCREEN; }
    @Override public String getIDstring() { return "wasm-screen-0"; }
    @Override public GraphicsConfiguration[] getConfigurations() { return new GraphicsConfiguration[]{ cfg }; }
    @Override public GraphicsConfiguration getDefaultConfiguration() { return cfg; }
}
