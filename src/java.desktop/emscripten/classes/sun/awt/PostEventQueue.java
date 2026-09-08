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

import java.awt.AWTEvent;
import java.awt.EventQueue;

/**
 * Compatibility shim for {@code sun.awt.PostEventQueue}, a JDK 8 internal class
 * removed in later JDKs. Some older applications (e.g. IntelliJ IDEA 2018.2)
 * reflectively construct it during startup and stash it in the {@code AppContext}
 * under {@code "PostEventQueue"}; failing to find the class throws and poisons
 * their event-queue bootstrap. Modern AWT no longer consults that AppContext
 * entry, so a thin forwarding wrapper is enough to let such apps proceed.
 */
public class PostEventQueue {

    private final EventQueue eventQueue;

    public PostEventQueue(EventQueue eq) {
        this.eventQueue = eq;
    }

    /** No pending private queue of our own. */
    public synchronized boolean noEvents() {
        return true;
    }

    /** Forward directly to the backing event queue. */
    public void postEvent(AWTEvent event) {
        if (event != null && eventQueue != null) {
            eventQueue.postEvent(event);
        }
    }

    /** Nothing is buffered here, so flush is a no-op. */
    public void flush() {
    }
}
