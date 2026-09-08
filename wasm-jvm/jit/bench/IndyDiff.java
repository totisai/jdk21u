// invokedynamic: string concatenation (`+`) compiles to invokedynamic
// makeConcatWithConstants. The call site is resolved on first interpreted run (the JIT
// gates on resolved -> transient retry), then the linked adapter is called with the
// dynamic args + appendix. Also exercises object return (String) and long/double args.
public class ID {
  static String jitConcat(int a, String b){ return "a=" + a + " b=" + b; }
  static String pConcat  (int a, String b){ return "a=" + a + " b=" + b; }
  static String jitMix(int i, long l, double d){ return i + "/" + l + "/" + d; } // long+double dyn args
  static String pMix  (int i, long l, double d){ return i + "/" + l + "/" + d; }
  static int fail=0;
  public static void main(String[] a){
    for (int k=0;k<80;k++){
      if(!jitConcat(5,"hi").equals(pConcat(5,"hi")))          fail++;
      if(!jitMix(3,100L,2.5).equals(pMix(3,100L,2.5)))        fail++;
    }
    System.out.println("concat=["+jitConcat(5,"hi")+"] mix=["+jitMix(3,100L,2.5)+"]");
    System.out.println(fail==0?"ALL PASS":"FAILURES="+fail);
  }
}
