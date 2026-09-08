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

import java.awt.Color;
import java.awt.Component;
import java.awt.Graphics;
import javax.swing.Icon;

/**
 * Compatibility shim for the Windows-only {@code WindowsTreeUI}, present only in
 * the Windows java.desktop build. Old apps reference its {@code ExpandedIcon} /
 * {@code CollapsedIcon} tree handles -- e.g. IntelliJ IDEA 2018.2's {@code IdeaLaf}
 * installs {@code Tree.expandedIcon}/{@code Tree.collapsedIcon} from them. Only the
 * two icon factories are needed; they draw the classic [-]/[+] handle.
 */
public class WindowsTreeUI {

    /** The [+] handle shown for a collapsed node. */
    public static class CollapsedIcon implements Icon {
        public static Icon createCollapsedIcon() {
            return new CollapsedIcon();
        }

        boolean isExpanded() {
            return false;
        }

        @Override
        public int getIconWidth() {
            return 9;
        }

        @Override
        public int getIconHeight() {
            return 9;
        }

        @Override
        public void paintIcon(Component c, Graphics g, int x, int y) {
            g.setColor(new Color(0x808080));
            g.drawRect(x, y, 8, 8);
            g.setColor(Color.WHITE);
            g.fillRect(x + 1, y + 1, 7, 7);
            g.setColor(Color.BLACK);
            g.drawLine(x + 2, y + 4, x + 6, y + 4);            // minus bar
            if (!isExpanded()) {
                g.drawLine(x + 4, y + 2, x + 4, y + 6);        // plus bar (collapsed)
            }
        }
    }

    /** The [-] handle shown for an expanded node. */
    public static class ExpandedIcon extends CollapsedIcon {
        public static Icon createExpandedIcon() {
            return new ExpandedIcon();
        }

        @Override
        boolean isExpanded() {
            return true;
        }
    }
}
