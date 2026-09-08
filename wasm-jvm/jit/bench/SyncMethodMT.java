// C4.2 synchronized METHOD (implicit monitor = `this`). Tests (a) mutual exclusion
// under contention and (b) unlock-on-exception: jitThrow throws while holding the
// method monitor; if the propagate path fails to unlock, a probe thread deadlocks.
public class SyncM {
  int counter = 0;
  synchronized int jitBumpN(int n){ int last=0; for(int i=0;i<n;i++){ counter = counter + 1; last = counter; } return last; }
  synchronized int jitThrow(int n){ counter = counter + 1; return 100 / n; }  // throws (n==0) while locked
  public static void main(String[] a) throws Exception {
    final SyncM o = new SyncM();
    final int N = 4, M = 20000;
    Thread[] ts = new Thread[N];
    for (int t = 0; t < N; t++) ts[t] = new Thread(() -> o.jitBumpN(M));
    for (Thread th : ts) th.start();
    for (Thread th : ts) th.join();
    int afterBump = o.counter;                          // must be exactly N*M (mutual exclusion)
    int caught = 0;
    for (int k = 0; k < 5; k++) { try { o.jitThrow(0); } catch (ArithmeticException e){ caught++; } }
    // if jitThrow leaked the monitor, this different thread deadlocks acquiring it
    final boolean[] ok = { false };
    Thread probe = new Thread(() -> { o.jitBumpN(1); ok[0] = true; });
    probe.start(); probe.join(3000);
    boolean pass = (afterBump == N*M) && (caught == 5) && ok[0];
    System.out.println("afterBump=" + afterBump + " expected=" + (N*M) + " caught=" + caught + " probeOk=" + ok[0]);
    System.out.println(pass ? "ALL PASS" : "FAILURES=1");
  }
}
