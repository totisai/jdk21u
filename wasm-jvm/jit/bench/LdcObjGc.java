// object-ldc GC-safety: a JIT'd method resolves a String literal (produced oop) and
// passes it to a call, in a 2M loop, under concurrent System.gc(). The literal oop is
// Handle-ized across the (user, non-final) call; a moving GC must not corrupt it.
// Must be exactly 2,000,000.
public class LDCG {
  static class Sink { int take(Object o){ return o==null ? 0 : 1; } }
  static long jitLoop(Sink s, int iters){ long n=0; for (int i=0;i<iters;i++) n += s.take("needle"); return n; }
  public static void main(String[] a) throws Exception {
    Sink s = new Sink();
    Thread gc = new Thread(() -> { for (int i=0;i<4000;i++){ System.gc();
      try { Thread.sleep(0, 100000); } catch (InterruptedException e) {} } });
    gc.setDaemon(true); gc.start();
    long r = jitLoop(s, 2_000_000);
    System.out.println("count=" + r + " expect=2000000");
    System.out.println(r == 2_000_000 ? "ALL PASS" : "FAILURES=1");
  }
}
