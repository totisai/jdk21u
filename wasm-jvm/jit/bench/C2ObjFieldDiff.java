public class C2f {
  static class Node { int v; Node next; }
  static int jitChain(Node n){ return n.next.v; }                 // getfield(obj) + getfield(int)
  static int jitSetGet(Node a, Node b){ a.next = b; return a.next.v; }  // putfield(obj)+barrier
  static int pChain(Node n){ return n.next.v; }
  static int pSetGet(Node a, Node b){ a.next = b; return a.next.v; }
  static int fail=0;
  static String exc(java.util.function.Supplier<Integer> f){ try{ f.get(); return "ok"; }catch(Throwable t){ return t.getClass().getSimpleName(); } }
  public static void main(String[] x){
    Node a=new Node(), b=new Node(), c=new Node(); b.v=77; c.v=5; a.next=b;
    for(int k=0;k<40;k++){
      if(jitChain(a)!=pChain(a)){System.out.println("FAIL chain");fail++;}
      if(jitSetGet(a,c)!=pSetGet(a,c)){System.out.println("FAIL setget");fail++;}
    }
    a.next=b; // restore
    if(!exc(()->jitChain(null)).equals(exc(()->pChain(null)))){System.out.println("FAIL npe1");fail++;}
    Node d=new Node(); // d.next=null
    if(!exc(()->jitChain(d)).equals(exc(()->pChain(d)))){System.out.println("FAIL npe2");fail++;}
    System.out.println("chain="+jitChain(a)+" setget="+jitSetGet(a,c)+" npe="+exc(()->jitChain(null))+" npe2="+exc(()->jitChain(d)));
    System.out.println(fail==0?"ALL PASS":("FAIL="+fail));
  }
}
