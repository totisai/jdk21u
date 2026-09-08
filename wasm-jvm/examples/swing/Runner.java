import javax.tools.*;
import javax.tools.JavaCompiler.CompilationTask;
import java.io.*;
import java.net.*;
import java.nio.file.*;
import java.util.*;
import java.util.regex.*;
import java.util.zip.*;
import java.lang.reflect.*;

/**
 * In-VM compile-and-run driver for the WebAssembly JVM demo.
 *
 * Reads Java source from /work/src.java, compiles it in-memory with the system
 * javac (jdk.compiler), then loads and runs the resulting class's main method.
 * Any jars found in /work/lib are added to BOTH the compile classpath and the
 * runtime classloader, so templates can pull in libraries (e.g. Spring).
 *
 * Output (compiler diagnostics + program output) goes to stdout/stderr, which
 * the page streams into its console panel.
 */
public class Runner {
    public static void main(String[] args) throws Exception {
        String srcPath = args.length > 0 ? args[0] : "/work/src.java";
        // The launcher passes no program args, so an optional extra classpath
        // dir (e.g. Spring jars under /app/springlib) is named in /work/uselib.
        String libPath = "/work/lib";
        try { if (new File("/work/uselib").isFile())
            libPath = Files.readString(Path.of("/work/uselib")).trim(); } catch (IOException ignore) {}
        String source = Files.readString(Path.of(srcPath));

        String className = detectClassName(source);
        if (className == null) {
            System.out.println("Could not find a class declaration in the source.");
            return;
        }

        // Collect classpath jars from /work/lib and explode each into its own
        // directory. Using exploded dirs (rather than the jars directly) means
        // libraries read their resources — e.g. META-INF/spring.factories — via
        // plain file: URLs instead of jar: URLs, which sidesteps the jar URL
        // protocol handler. Each jar keeps a separate dir so same-named
        // resources across jars (every Spring jar has spring.factories) all
        // remain discoverable via ClassLoader.getResources().
        List<File> jars = new ArrayList<>();
        File libDir = new File(libPath);
        if (libDir.isDirectory()) {
            File[] fs = libDir.listFiles();
            if (fs != null) for (File f : fs) if (f.getName().endsWith(".jar")) jars.add(f);
            Collections.sort(jars);
        }
        List<File> cpDirs = new ArrayList<>();
        if (!jars.isEmpty()) {
            long e0 = System.currentTimeMillis();
            for (File jar : jars) cpDirs.add(explode(jar));
            System.out.println("[classpath: " + jars.size() + " jar(s) exploded in "
                    + (System.currentTimeMillis() - e0) + " ms]");
        }

        JavaCompiler compiler = ToolProvider.getSystemJavaCompiler();
        if (compiler == null) {
            System.out.println("No system Java compiler is available (jdk.compiler not resolved).");
            return;
        }

        DiagnosticCollector<JavaFileObject> diags = new DiagnosticCollector<>();
        StandardJavaFileManager fm = compiler.getStandardFileManager(diags, null, null);
        Files.createDirectories(Path.of("/work/out"));
        fm.setLocation(StandardLocation.CLASS_OUTPUT, List.of(new File("/work/out")));
        if (!cpDirs.isEmpty()) fm.setLocation(StandardLocation.CLASS_PATH, cpDirs);

        JavaFileObject srcObj = new SimpleJavaFileObject(
                URI.create("string:///" + className + ".java"), JavaFileObject.Kind.SOURCE) {
            @Override public CharSequence getCharContent(boolean ignoreEncodingErrors) { return source; }
        };

        // Target Java 21 bytecode (matches the wasm JVM; Spring 6.1 supports 21).
        List<String> options = Arrays.asList("-source", "21", "-target", "21",
                "-Xlint:none", "-nowarn");

        long t0 = System.currentTimeMillis();
        CompilationTask task = compiler.getTask(null, fm, diags, options, null, List.of(srcObj));
        boolean ok = task.call();
        long compileMs = System.currentTimeMillis() - t0;

        for (Diagnostic<? extends JavaFileObject> d : diags.getDiagnostics()) {
            if (d.getKind() == Diagnostic.Kind.NOTE || d.getKind() == Diagnostic.Kind.WARNING
                    || d.getKind() == Diagnostic.Kind.MANDATORY_WARNING) continue;
            System.out.println(d.getKind() + ": line " + d.getLineNumber() + ": " + d.getMessage(null));
        }
        if (!ok) {
            System.out.println("--- compilation failed ---");
            return;
        }
        System.out.println("[compiled " + className + " in " + compileMs + " ms]");
        System.out.flush();

        // Runtime classloader: user output dir + jars, isolated above the platform loader.
        List<URL> urls = new ArrayList<>();
        urls.add(new File("/work/out").toURI().toURL());
        for (File d : cpDirs) urls.add(d.toURI().toURL());
        URLClassLoader cl = new URLClassLoader(urls.toArray(new URL[0]),
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

    /** Explode a jar into /work/cp/<jarname>/ and return that directory. */
    private static File explode(File jar) throws IOException {
        String name = jar.getName();
        if (name.endsWith(".jar")) name = name.substring(0, name.length() - 4);
        File dir = new File("/work/cp/" + name);
        if (new File(dir, ".done").isFile()) return dir;   // already exploded
        dir.mkdirs();
        try (ZipInputStream zis = new ZipInputStream(new BufferedInputStream(new FileInputStream(jar)))) {
            ZipEntry e;
            byte[] buf = new byte[8192];
            while ((e = zis.getNextEntry()) != null) {
                File out = new File(dir, e.getName());
                if (e.isDirectory()) { out.mkdirs(); continue; }
                File parent = out.getParentFile();
                if (parent != null) parent.mkdirs();
                try (OutputStream os = new BufferedOutputStream(new FileOutputStream(out))) {
                    int r;
                    while ((r = zis.read(buf)) != -1) os.write(buf, 0, r);
                }
            }
        }
        new FileOutputStream(new File(dir, ".done")).close();
        return dir;
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
