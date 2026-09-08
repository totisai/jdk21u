// Regression: a JIT'd method that RETURNS (or passes to a call) a String-literal
// produced by object-ldc. This exposed a latent constant-pool bug: wasmjit_ldc_oop
// used resolve_constant_at(pool_index), which for a reference-cached constant
// (String/MethodHandle/MethodType/Dynamic) passes _no_index_sentinel as the object
// cache index -> string_at_impl reads resolved_reference_at(-1) OUT OF BOUNDS and
// returns garbage (the guarding assert is a no-op in a product build). The garbage
// oop's klass is corrupt -> AbstractMethodError / getClass()==null / a bad indirect
// call ("table index out of bounds"), depending on heap layout. This was the root of
// the sun.awt.SunToolkit.flushPendingEvents miscompile that killed Swing interactivity
// under WASMJIT_ALL. Fix: reference-cached tags use resolve_possibly_cached_constant_at.
//
// Run POST-warmup (JITALL=1) so the ldc is quickened to fast_aldc, matching the app.
public class SOC {
  static final java.util.HashMap<Object,Object> MAP = new java.util.HashMap<>();
  static Object jitLit()      { return "PostEventQueue"; }          // ldc + areturn
  static Object jitGet(java.util.HashMap<Object,Object> m){ return m.get("PostEventQueue"); } // ldc as call arg

  static int fail = 0;
  public static void main(String[] a){
    MAP.put("PostEventQueue", "hello");
    for (int k = 0; k < 400; k++){
      Object o = jitLit();
      if (o != "PostEventQueue") fail++;                            // identity: same interned String
      if (o == null || o.getClass() != String.class) fail++;       // klass intact (was corrupt)
      Object g = jitGet(MAP);
      if (!"hello".equals(g)) fail++;
    }
    System.out.println("lit=" + jitLit() + " getClass=" + jitLit().getClass().getName());
    System.out.println(fail == 0 ? "ALL PASS" : "FAILURES=" + fail);
  }
}
