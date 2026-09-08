// oop-across-call (b): object ARGUMENTS to calls (frame oop passed to a virtual /
// static callee). invoke_common Handle-izes oop args, so these must match.
public class OA {
  static class Node { int v; Node(int v){ this.v=v; } int add(Node o){ return v + o.v; } }
  static int jitVArg(Node a, Node b){ return a.add(b); }     // invokevirtual, object arg
  static int pVArg  (Node a, Node b){ return a.add(b); }
  static int sink(Node x){ return x==null ? -1 : x.v; }
  static int jitSArg(Node a){ return sink(a); }              // invokestatic, object arg
  static int pSArg  (Node a){ return sink(a); }
  static int fail=0;
  public static void main(String[] s){
    Node a=new Node(10), b=new Node(20);
    for(int k=0;k<40;k++){
      if(jitVArg(a,b)!=pVArg(a,b)){System.out.println("FAIL varg");fail++;}
      if(jitSArg(a)  !=pSArg(a))  {System.out.println("FAIL sarg");fail++;}
    }
    System.out.println("varg="+jitVArg(a,b)+" sarg="+jitSArg(a));  // 30, 10
    System.out.println(fail==0?"ALL PASS":("FAILURES="+fail));
  }
}
