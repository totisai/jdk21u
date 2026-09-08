// C4.2 CONCURRENCY proof: N threads each run a JIT'd synchronized increment M times.
// If monitorenter/exit provide real mutual exclusion, counter == N*M exactly (no lost
// updates) and it doesn't deadlock. jitBump is JIT'd (named jit*); main is interpreted
// (its lambda uses invokedynamic, which only needs to run interpreted).
public class SyncMT {
  static int counter = 0;
  static int jitBump(Object lk, int iters){
    int last = 0;
    for (int i = 0; i < iters; i++) { synchronized (lk) { counter = counter + 1; last = counter; } }
    return last;
  }
  public static void main(String[] a) throws Exception {
    final Object lk = new Object();
    final int N = 4, M = 20000;
    Thread[] ts = new Thread[N];
    for (int t = 0; t < N; t++) ts[t] = new Thread(() -> jitBump(lk, M));
    for (Thread th : ts) th.start();
    for (Thread th : ts) th.join();
    int expected = N * M;
    System.out.println("counter=" + counter + " expected=" + expected);
    System.out.println(counter == expected ? "ALL PASS" : ("FAILURES=1 (lost " + (expected - counter) + ")"));
  }
}
