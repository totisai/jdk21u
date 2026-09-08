// object return: a JIT'd method whose OWN return type is an object. parse_sig now
// accepts it (rt=TA/areturn); the oop is returned as its i64 addr and the interpreter
// hook pushes it as an oop (SET_STACK_OBJECT). Covers: return an arg oop, a getfield
// oop, and via a branch.
public class OR {
  static class Node { Node next; int v; Node(int v, Node n){ this.v=v; this.next=n; } }
  static String jitId  (String s){ return s; }                          // return arg oop
  static String pId    (String s){ return s; }
  static Node   jitNext(Node n){ return n.next; }                       // return getfield oop
  static Node   pNext  (Node n){ return n.next; }
  static Object jitPick(boolean b, Object x, Object y){ return b ? x : y; } // return via branch
  static Object pPick  (boolean b, Object x, Object y){ return b ? x : y; }
  static int fail=0;
  public static void main(String[] a){
    Node c = new Node(3,null), b = new Node(2,c);
    for (int k=0;k<80;k++){
      if(jitId("hi")               !=pId("hi"))                fail++;
      if(jitNext(b)                !=pNext(b))                 fail++;
      if(jitPick(true,"x","y")     !=pPick(true,"x","y"))      fail++;
      if(jitPick(false,"x","y")    !=pPick(false,"x","y"))     fail++;
    }
    System.out.println("id="+jitId("hi")+" next="+jitNext(b).v+" pick="+jitPick(true,"a","b"));
    System.out.println(fail==0?"ALL PASS":"FAILURES="+fail);
  }
}
