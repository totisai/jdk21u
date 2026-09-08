// oop-across-call GC-safety: a JIT'd method calls getNext() (produces a heap oop) and
// immediately calls getVal() on it, in a 2M loop, while another thread hammers
// System.gc(). If the produced oop weren't Handle-ized across the receiver call, a
// moving GC would corrupt it -> wrong sum or crash. Must be exactly 2 * 2,000,000.
public class OCG {
  static class Node { int v; Node next; Node(int v, Node n){ this.v=v; this.next=n; }
    Node getNext(){ return next; } int getVal(){ return v; } }
  static long jitSum(Node head, int iters){ long s=0; for (int i=0;i<iters;i++){ s += head.getNext().getVal(); } return s; }
  public static void main(String[] a) throws Exception {
    final Node c = new Node(3, null), b = new Node(2, c), h = new Node(1, b);
    Thread gc = new Thread(() -> { for (int i=0;i<4000;i++){ System.gc();
      try { Thread.sleep(0, 100000); } catch (InterruptedException e) {} } });
    gc.setDaemon(true); gc.start();
    long r = jitSum(h, 2_000_000);
    long expect = 2L * 2_000_000;
    System.out.println("sum=" + r + " expect=" + expect);
    System.out.println(r == expect ? "ALL PASS" : "FAILURES=1");
  }
}
