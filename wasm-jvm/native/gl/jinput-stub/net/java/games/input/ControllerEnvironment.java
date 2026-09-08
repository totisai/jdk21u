package net.java.games.input;
/* Stub environment that reports zero controllers, so LWJGL's Controllers.create()
 * completes cleanly instead of NoClassDefFoundError-ing on the real jinput. */
public abstract class ControllerEnvironment {
    public abstract Controller[] getControllers();
    public boolean isSupported() { return false; }
    private static final ControllerEnvironment DEFAULT = new ControllerEnvironment() {
        public Controller[] getControllers() { return new Controller[0]; }
    };
    public static ControllerEnvironment getDefaultEnvironment() { return DEFAULT; }
}
