/* Copyright (c) 2025, Oracle and/or its affiliates. Classpath-exception-2.0. */
package sun.awt;

import java.awt.GraphicsConfiguration;
import java.awt.GraphicsDevice;
import java.awt.Rectangle;
import java.awt.Transparency;
import java.awt.geom.AffineTransform;
import java.awt.image.ColorModel;
import java.awt.image.DirectColorModel;

/** GraphicsConfiguration for the wasm virtual screen (a single RGB raster). */
public final class WasmGraphicsConfiguration extends GraphicsConfiguration {
    private final WasmGraphicsDevice device;

    WasmGraphicsConfiguration(WasmGraphicsDevice device) { this.device = device; }

    @Override public GraphicsDevice getDevice() { return device; }
    @Override public ColorModel getColorModel() { return ColorModel.getRGBdefault(); }
    @Override public ColorModel getColorModel(int transparency) {
        if (transparency == Transparency.OPAQUE)
            return new DirectColorModel(24, 0xff0000, 0xff00, 0xff);
        return ColorModel.getRGBdefault();
    }
    @Override public AffineTransform getDefaultTransform() { return new AffineTransform(); }
    @Override public AffineTransform getNormalizingTransform() { return new AffineTransform(); }
    @Override public Rectangle getBounds() { return new Rectangle(0, 0, device.width, device.height); }
}
