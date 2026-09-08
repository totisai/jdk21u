// Source for the runnable demo jar used by run-jar.html.
// Build:  javac --release 21 -d /tmp/da DemoApp.java
//         jar --create --file demo.jar --main-class DemoApp -C /tmp/da .
public class DemoApp {
    public static void main(String[] args) throws Exception {
        System.out.println("Booted from a runnable JAR on the wasm JVM (JDK "
                + System.getProperty("java.version") + ")");
        System.out.println("program args = " + java.util.Arrays.toString(args));
        var loc = DemoApp.class.getProtectionDomain().getCodeSource().getLocation();
        System.out.println("code source  = " + loc);            // proves it ran from the jar
        long a = 0, b = 1;
        for (int i = 0; i < 40; i++) { long t = a + b; a = b; b = t; }
        System.out.println("fib(40)      = " + a);
    }
}
