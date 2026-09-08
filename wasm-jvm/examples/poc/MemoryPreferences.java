import java.util.prefs.AbstractPreferences;
import java.util.HashMap;
import java.util.Map;

/**
 * In-memory java.util.prefs backend for the wasm JVM. The default
 * FileSystemPreferences does file locking via syscalls emscripten doesn't
 * support (it hangs), so this session-scoped, non-persistent store stands in --
 * enough for apps that read/write preferences at runtime.
 */
public final class MemoryPreferences extends AbstractPreferences {
    private final Map<String, String> values = new HashMap<>();
    private final Map<String, MemoryPreferences> children = new HashMap<>();

    public MemoryPreferences(MemoryPreferences parent, String name) { super(parent, name); }

    protected void putSpi(String key, String value) { values.put(key, value); }
    protected String getSpi(String key) { return values.get(key); }
    protected void removeSpi(String key) { values.remove(key); }
    protected void removeNodeSpi() { values.clear(); children.clear(); }
    protected String[] keysSpi() { return values.keySet().toArray(new String[0]); }
    protected String[] childrenNamesSpi() { return children.keySet().toArray(new String[0]); }
    protected AbstractPreferences childSpi(String name) {
        MemoryPreferences c = children.get(name);
        if (c == null) { c = new MemoryPreferences(this, name); children.put(name, c); }
        return c;
    }
    protected void syncSpi() { }
    protected void flushSpi() { }
}
