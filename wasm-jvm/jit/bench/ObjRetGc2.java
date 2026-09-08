// Isolates the produced-oop-across-GC pattern from the StringConcat/MethodHandle indy
// bootstrap: identical to ObjRetGc but prints via a ternary of string literals (no
// "a"+b concatenation), so no invokedynamic is linked. If this passes but ObjRetGc
// crashes, the remaining failure is the JIT'd java.lang.invoke bootstrap, not the
// object-return oop path.
public class ORG2 {
  static class Node { Node next; int v; Node(int v, Node n){ this.v=v; this.next=n; } }
  static Node jitNext(Node n){ return n.next; }        // JIT'd, returns a heap oop
  public static void main(String[] a) throws Exception {
    Node c=new Node(3,null), b=new Node(2,c), h=new Node(1,b);
    Thread gc=new Thread(()->{ for(int i=0;i<4000;i++){ System.gc();
      try{Thread.sleep(0,100000);}catch(InterruptedException e){} } }); gc.setDaemon(true); gc.start();
    long s=0; for(int i=0;i<2_000_000;i++){ Node n=jitNext(jitNext(h)); s += n.v; }
    System.out.println(s==6_000_000L ? "ALL PASS" : "FAILURES=1");
  }
}
