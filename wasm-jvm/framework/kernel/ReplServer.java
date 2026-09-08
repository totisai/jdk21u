import javax.tools.*;
import javax.tools.JavaCompiler.CompilationTask;
import java.io.*;
import java.net.*;
import java.nio.file.*;
import java.util.*;
import java.util.regex.*;
import java.lang.reflect.*;

/**
 * Warm-VM compile-and-run driver for the WebAssembly JVM REPL.
 *
 * Unlike {@code Runner} (which compiles + runs once and exits), this stays
 * resident: the launcher invokes {@code ReplServer.main} once, and it loops,
 * keeping the JVM (and the loaded {@code jdk.compiler}) warm across requests.
 *
 * Protocol (small MEMFS control files the JS host writes/reads):
 *   /work/req      one line, a monotonically increasing integer. Bumping it
 *                  requests a compile+run of the current /work/src.java.
 *   /work/src.java the Java source to compile and run.
 *   /work/resp     written by this driver with the request id once the run is
 *                  done, so the host knows the run finished.
 *
 * Program stdout/stderr go to the process's stdout/stderr, which the JS host
 * streams into its console live. Boot prints {@code [repl] ready}.
 */
public class ReplServer {
    public static void main(String[] args) throws Exception {
        Path reqPath = Path.of("/work/req");
        Path respPath = Path.of("/work/resp");
        JavaCompiler compiler = ToolProvider.getSystemJavaCompiler();
        if (compiler == null) {
            System.out.println("No system Java compiler is available (jdk.compiler not resolved).");
            return;
        }
        System.out.println("[repl] ready");
        System.out.flush();

        long last = 0;   // preRun writes req=0 at boot; any request >=1 triggers (no boot race)
        while (true) {
            long cur = readSeq(reqPath);
            if (cur != last) {
                last = cur;
                try {
                    runOnce(compiler);
                } catch (Throwable t) {
                    System.out.println("--- driver error: " + t + " ---");
                }
                try { Files.writeString(respPath, Long.toString(cur)); } catch (IOException ignored) {}
                System.out.flush();
            }
            Thread.sleep(40);
        }
    }

    /** Compile /work/src.java and invoke its main, streaming output to stdout. */
    private static void runOnce(JavaCompiler compiler) throws Exception {
        String source;
        try {
            source = Files.readString(Path.of("/work/src.java"));
        } catch (IOException e) {
            System.out.println("no /work/src.java to run");
            return;
        }
        String className = detectClassName(source);
        if (className == null) {
            System.out.println("Could not find a class declaration in the source.");
            return;
        }

        // Fresh output dir per run so redefinitions don't collide.
        Path outDir = Path.of("/work/out");
        deleteTree(outDir);
        Files.createDirectories(outDir);

        DiagnosticCollector<JavaFileObject> diags = new DiagnosticCollector<>();
        StandardJavaFileManager fm = compiler.getStandardFileManager(diags, null, null);
        fm.setLocation(StandardLocation.CLASS_OUTPUT, List.of(outDir.toFile()));

        JavaFileObject srcObj = new SimpleJavaFileObject(
                URI.create("string:///" + className + ".java"), JavaFileObject.Kind.SOURCE) {
            @Override public CharSequence getCharContent(boolean ignore) { return source; }
        };
        List<String> options = Arrays.asList("-source", "17", "-target", "17", "-Xlint:none", "-nowarn");

        long t0 = System.currentTimeMillis();
        CompilationTask task = compiler.getTask(null, fm, diags, options, null, List.of(srcObj));
        boolean ok = task.call();
        long compileMs = System.currentTimeMillis() - t0;

        for (Diagnostic<? extends JavaFileObject> d : diags.getDiagnostics()) {
            if (d.getKind() == Diagnostic.Kind.NOTE || d.getKind() == Diagnostic.Kind.WARNING
                    || d.getKind() == Diagnostic.Kind.MANDATORY_WARNING) continue;
            System.out.println(d.getKind() + ": line " + d.getLineNumber() + ": " + d.getMessage(null));
        }
        if (!ok) { System.out.println("--- compilation failed ---"); return; }
        System.out.println("[compiled " + className + " in " + compileMs + " ms]");
        System.out.flush();

        // Fresh classloader per run so re-running a redefined class picks up new bytes.
        URLClassLoader cl = new URLClassLoader(new URL[]{ outDir.toUri().toURL() },
                ClassLoader.getSystemClassLoader());
        Thread.currentThread().setContextClassLoader(cl);
        Class<?> c = Class.forName(className, true, cl);
        Method m;
        try {
            m = c.getDeclaredMethod("main", String[].class);
        } catch (NoSuchMethodException e) {
            System.out.println("Class " + className + " has no 'public static void main(String[])'.");
            return;
        }
        m.setAccessible(true);
        long r0 = System.currentTimeMillis();
        try {
            m.invoke(null, (Object) new String[0]);
        } catch (InvocationTargetException e) {
            Throwable cause = e.getCause() != null ? e.getCause() : e;
            System.out.println("--- program threw " + cause + " ---");
            cause.printStackTrace(System.out);
        }
        System.out.println("[ran in " + (System.currentTimeMillis() - r0) + " ms]");
        System.out.flush();
    }

    private static long readSeq(Path p) {
        try {
            String s = Files.readString(p).trim();
            return s.isEmpty() ? 0 : Long.parseLong(s);
        } catch (Exception e) {
            return 0;
        }
    }

    private static void deleteTree(Path dir) {
        if (!Files.exists(dir)) return;
        try {
            Files.walk(dir).sorted(Comparator.reverseOrder()).forEach(p -> {
                try { Files.delete(p); } catch (IOException ignored) {}
            });
        } catch (IOException ignored) {}
    }

    private static String detectClassName(String src) {
        Matcher pub = Pattern.compile(
                "(?m)^\\s*public\\s+(?:final\\s+|abstract\\s+|sealed\\s+|non-sealed\\s+)*" +
                "(?:class|interface|enum|record)\\s+(\\w+)").matcher(src);
        if (pub.find()) return pub.group(1);
        Matcher any = Pattern.compile(
                "(?m)^\\s*(?:final\\s+|abstract\\s+|sealed\\s+|non-sealed\\s+)*" +
                "(?:class|interface|enum|record)\\s+(\\w+)").matcher(src);
        if (any.find()) return any.group(1);
        return null;
    }
}
