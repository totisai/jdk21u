// object-return GC-safety: a JIT'd method returns a heap oop (arg / getfield) in a 2M
// loop under concurrent System.gc(). The interp hook pushes the returned oop; a moving
// GC must not corrupt it. Verify the returned chain stays walkable (sum stable).
public class ORG {
  static class Node { Node next; int v; Node(int v, Node n){ this.v=v; this.next=n; } }
  static Node jitNext(Node n){ return n.next; }        // JIT'd, returns a heap oop
  public static void main(String[] a) throws Exception {
    Node c=new Node(3,null), b=new Node(2,c), h=new Node(1,b);
    Thread gc=new Thread(()->{ for(int i=0;i<4000;i++){ System.gc();
      try{Thread.sleep(0,100000);}catch(InterruptedException e){} } }); gc.setDaemon(true); gc.start();
    long s=0; for(int i=0;i<2_000_000;i++){ Node n=jitNext(jitNext(h)); s += n.v; }  // h.next.next = c (v=3)
    System.out.println("s="+s+" expect="+(3L*2_000_000));
    System.out.println(s==3L*2_000_000?"ALL PASS":"FAILURES=1");
  }
}
