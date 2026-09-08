import java.util.prefs.Preferences;
import java.util.prefs.PreferencesFactory;

/** Selected via -Djava.util.prefs.PreferencesFactory=MemoryPreferencesFactory. */
public final class MemoryPreferencesFactory implements PreferencesFactory {
    private static final Preferences USER   = new MemoryPreferences(null, "");
    private static final Preferences SYSTEM = new MemoryPreferences(null, "");
    public Preferences userRoot()   { return USER; }
    public Preferences systemRoot() { return SYSTEM; }
}
