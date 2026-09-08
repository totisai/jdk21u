// oop-across-call (a): a PRODUCED oop (invoke result / object getfield) used as the
// receiver of the next call must JIT (was gated by produces_oop && has_call). The
// produced oop is consumed immediately as a receiver arg -> Handle-ized by
// wasmjit_invoke_common. jit* methods JIT; p* twins interpret.
public class OC {
  static class Node { int v; Node next; Node(int v, Node n){ this.v=v; this.next=n; }
    Node getNext(){ return next; } int getVal(){ return v; } }
  static int jitChainCall(Node n){ return n.getNext().getVal(); }   // invoke result oop -> invoke receiver
  static int pChainCall  (Node n){ return n.getNext().getVal(); }
  static int jitFieldCall(Node n){ return n.next.getVal(); }        // getfield oop -> invoke receiver
  static int pFieldCall  (Node n){ return n.next.getVal(); }
  static int jitTwoHop   (Node n){ return n.getNext().getNext().getVal(); }  // oop result -> receiver -> receiver
  static int pTwoHop     (Node n){ return n.getNext().getNext().getVal(); }
  static int fail=0;
  public static void main(String[] a){
    Node c = new Node(3, null), b = new Node(2, c), aN = new Node(1, b);
    for (int k=0;k<40;k++){
      if(jitChainCall(aN)!=pChainCall(aN)){ System.out.println("FAIL chain"); fail++; }
      if(jitFieldCall(aN)!=pFieldCall(aN)){ System.out.println("FAIL field"); fail++; }
      if(jitTwoHop(aN)   !=pTwoHop(aN))   { System.out.println("FAIL twohop"); fail++; }
    }
    System.out.println("chain="+jitChainCall(aN)+" field="+jitFieldCall(aN)+" twohop="+jitTwoHop(aN)); // 2,2,3
    System.out.println(fail==0?"ALL PASS":("FAILURES="+fail));
  }
}
