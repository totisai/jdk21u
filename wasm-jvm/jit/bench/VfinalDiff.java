// _fast_invokevfinal (0xe3): HotSpot rewrites invokevirtual of a vfinal method (a final
// method, or any method of a final class) to _fast_invokevfinal after the first execution.
// This is a resolved, direct (kind-0) call -- now handled like invokevirtual. String is
// final, so every String method call goes through this path; jitLen/jitCh exercise it,
// jitFin covers a user final class.
public class VF {
  static final class Fin { int f(int x){ return x*3 + 1; } }   // final class -> f is vfinal
  static int jitFin(Fin a, int x){ return a.f(x); }
  static int pFin  (Fin a, int x){ return a.f(x); }
  static int jitLen(String s){ return s.length(); }            // String.length (vfinal)
  static int pLen  (String s){ return s.length(); }
  static int jitCh (String s, int i){ return s.charAt(i); }    // String.charAt (vfinal)
  static int pCh   (String s, int i){ return s.charAt(i); }
  static int fail=0;
  public static void main(String[] a){
    Fin fin = new Fin(); String[] ss = {"hello","x","abcdef"};
    for (int k=0;k<80;k++){
      if(jitFin(fin,k)!=pFin(fin,k)){fail++;System.out.println("FAIL fin");}
      for (String s: ss){
        if(jitLen(s)!=pLen(s)){fail++;System.out.println("FAIL len");}
        if(jitCh(s,0)!=pCh(s,0)){fail++;System.out.println("FAIL ch");}
      }
    }
    System.out.println("fin="+jitFin(fin,5)+" len="+jitLen("hello")+" ch="+jitCh("hello",1)); // 16,5,101
    System.out.println(fail==0?"ALL PASS":"FAILURES="+fail);
  }
}
