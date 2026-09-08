// Mirror of Optional.stream(): object return + vfinal call + this.field (aaccess_0, object
// field) + invokestatic with object arg/return. Forces the fused forms under JITALL.
public class OR2 {
  static final class Opt {
    Object value; boolean present;
    boolean isP(){ return present; }                 // final class -> vfinal
    Object streamish(){ if (isP()) return wrap(value); else return empty(); }
    static Object wrap(Object o){ return o; }
    static Object empty(){ return null; }
  }
  public static void main(String[] a){
    Opt p = new Opt(); p.value = "x"; p.present = true;
    Opt q = new Opt(); q.present = false;
    long h = 0;
    for (int i = 0; i < 300000; i++) { Object r = (i&1)==0 ? p.streamish() : q.streamish(); if (r != null) h++; }
    System.out.println("h=" + h + " (expect 150000)");
    System.out.println(h == 150000 ? "ALL PASS" : "FAILURES=1");
  }
}
