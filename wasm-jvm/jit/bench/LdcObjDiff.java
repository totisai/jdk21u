// object ldc: String/Class literals now JIT. javac leaves object ldc in two live forms
// -- raw `ldc`/`ldc_w` (0x12/0x13; operand is the pool index; e.g. a Class literal) and,
// when the Rewriter quickens it, `fast_aldc`/`_w` (0xe6/0xe7; operand a resolved-refs
// index mapped back to the pool index; e.g. a String literal). Both resolve to the oop
// via one helper. The produced oop is carried across a call by slice-1 (Handle-ized as
// arg/receiver). jitStrArg exercises the fast_aldc form, jitClsArg the raw-ldc form.
//
// The callee is a user, non-final class/method on purpose: String is `final`, so its
// methods are vfinal and HotSpot rewrites their invokevirtual to _fast_invokevfinal
// (0xe3) after warmup -- unsupported yet, so a String-method callee would JIT once then
// bail on the rewrite. A non-final user callee keeps invokevirtual (0xb6) stable.
// (Object *return* -- `return "x"` -- is also separate: the interp<->JIT oop-return
// bridge; parse_sig still bails an object return.)
public class LDC {
  static class Sink { int take(Object o){ return o==null ? 0 : 1; } }
  static int jitStrArg(Sink s){ return s.take("literal"); }   // fast_aldc String -> invokevirtual arg
  static int pStrArg  (Sink s){ return s.take("literal"); }
  static int jitClsArg(Sink s){ return s.take(LDC.class); }   // fast_aldc Class  -> invokevirtual arg
  static int pClsArg  (Sink s){ return s.take(LDC.class); }
  static int jitNull  (Sink s){ return s.take(null); }        // control: no ldc, aconst_null arg
  static int pNull    (Sink s){ return s.take(null); }
  static int fail=0;
  public static void main(String[] a){
    Sink s = new Sink();
    for (int k=0;k<60;k++){
      if(jitStrArg(s)!=pStrArg(s)){System.out.println("FAIL str"); fail++;}
      if(jitClsArg(s)!=pClsArg(s)){System.out.println("FAIL cls"); fail++;}
      if(jitNull(s)  !=pNull(s))  {System.out.println("FAIL null");fail++;}
    }
    System.out.println("str="+jitStrArg(s)+" cls="+jitClsArg(s)+" null="+jitNull(s)); // 1,1,0
    System.out.println(fail==0?"ALL PASS":("FAILURES="+fail));
  }
}
