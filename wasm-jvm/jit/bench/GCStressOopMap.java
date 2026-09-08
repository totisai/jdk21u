// GC-stress harness for validating oop-map correctness in JIT'd code.
// Exercise a JIT'd method under heavy concurrent GC while holding live oop references
// on the value stack, in locals, and across call boundaries. Detects oop-rooting gaps
// (dangling pointers, stale addresses, type confusion).
public class GCOM {
  static class Node { Node next; int v; Node(int v, Node n){ this.v=v; this.next=n; } }

  // JIT'd method: takes an oop arg, returns an oop, holds oops in locals across a call.
  // If oops are not properly rooted across GC, this will crash or return garbage.
  static Node jitChain(Node n, int depth) {
    if (depth == 0) return n;
    Node x = jitChain(n.next, depth - 1);   // oop arg n, returned oop x both GC-live
    return x == null ? n : x;                 // oop comparison across potential safepoint
  }

  public static void main(String[] a) throws Exception {
    // Build a long chain of nodes
    Node h = null;
    for (int i = 0; i < 1000; i++) h = new Node(i, h);

    // Concurrent GC thread hammers gc() while main thread JIT-compiles and exercises oops
    Thread gc = new Thread(() -> {
      for (int i = 0; i < 2000; i++) {
        System.gc();
        try { Thread.sleep(0, 50000); } catch (InterruptedException e) {}
      }
    });
    gc.setDaemon(true);
    gc.start();

    // Walk the chain 100 times, JIT'ing jitChain and holding result across gc
    long checksum = 0;
    for (int cycle = 0; cycle < 100; cycle++) {
      Node result = jitChain(h, 100);
      if (result == null || result.v < 0) {
        System.out.println("FAILURES=1");  // dangling oop / corrupted ref
        return;
      }
      checksum += result.v;
    }
    System.out.println("checksum=" + checksum);
    System.out.println(checksum > 0 ? "ALL PASS" : "FAILURES=1");  // checksum should be non-zero
  }
}
