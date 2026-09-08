/*
 * Copyright (c) 2026, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * This code is free software; you can redistribute it and/or modify it
 * under the terms of the GNU General Public License version 2 only, as
 * published by the Free Software Foundation.  Oracle designates this
 * particular file as subject to the "Classpath" exception as provided
 * by Oracle in the LICENSE file that accompanied this code.
 *
 * This code is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
 * FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public License
 * version 2 for more details (a copy is included in the LICENSE file that
 * accompanied this code).
 *
 * You should have received a copy of the GNU General Public License version
 * 2 along with this work; if not, write to the Free Software Foundation,
 * Inc., 51 Franklin St, Fifth Floor, Boston, MA 02110-1301 USA.
 *
 * Please contact Oracle, 500 Oracle Parkway, Redwood Shores, CA 94065 USA
 * or visit www.oracle.com if you need additional information or have any
 * questions.
 */

package sun.nio.fs;

import java.io.IOException;

/**
 * Emscripten implementation of FileStore.
 *
 * Emscripten does not expose a mount table, so the entire virtual file
 * system is treated as a single, root-mounted store.
 */

class EmscriptenFileStore extends UnixFileStore {

    EmscriptenFileStore(UnixPath file) throws IOException {
        super(file);
    }

    EmscriptenFileStore(UnixFileSystem fs, UnixMountEntry entry) throws IOException {
        super(fs, entry);
    }

    /**
     * Finds, and returns, the mount entry for the file system where the file
     * resides. As emscripten has no enumerable mount table, the root is used.
     */
    @Override
    UnixMountEntry findMountEntry() throws IOException {
        // Emscripten has no mount table; represent the whole VFS as a single
        // root-mounted store with default (empty) entry information.
        return new UnixMountEntry();
    }
}
