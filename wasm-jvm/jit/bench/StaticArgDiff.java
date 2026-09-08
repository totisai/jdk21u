// invokestatic with object args: the fast direct-call path can't GC-hold oop args, so
// these now route through the general JavaCalls path (invoke_common kind 3, no receiver,
// oop args Handle-ized). Covers object arg, object args + object return, and mixed
// prim+object args (object in the middle).
public class SA {
  static class Box { int v; Box(int v){ this.v=v; } }
  static int sink(Box o){ return o==null ? -1 : o.v; }                 // static, object arg
  static int jitSink(Box o){ return sink(o); }
  static int pSink  (Box o){ return sink(o); }
  static Box pick(boolean b, Box x, Box y){ return b ? x : y; }        // static, object args + obj return
  static Box jitPick(boolean b, Box x, Box y){ return pick(b,x,y); }
  static Box pPick  (boolean b, Box x, Box y){ return pick(b,x,y); }
  static int add(int a, Box o, int b){ return a + o.v + b; }           // static, mixed prim/obj/prim
  static int jitMix(Box o){ return add(10, o, 5); }
  static int pMix  (Box o){ return add(10, o, 5); }
  static int fail=0;
  public static void main(String[] a){
    Box p=new Box(42), q=new Box(7);
    for (int k=0;k<80;k++){
      if(jitSink(p)      !=pSink(p))       fail++;
      if(jitSink(null)   !=pSink(null))    fail++;
      if(jitPick(true,p,q)!=pPick(true,p,q))   fail++;
      if(jitPick(false,p,q)!=pPick(false,p,q)) fail++;
      if(jitMix(p)       !=pMix(p))        fail++;
    }
    System.out.println("sink="+jitSink(p)+" pick="+jitPick(true,p,q).v+" mix="+jitMix(p)); // 42,42,57
    System.out.println(fail==0?"ALL PASS":"FAILURES="+fail);
  }
}
