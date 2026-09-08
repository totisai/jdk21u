public class C2a {
  static class Node { int v; }
  static int  jitAget(Node[] a){ return a[0].v + a[1].v; }             // aaload(typed) + getfield
  static int  jitSetGet(Node[] a, int i, Node n){ a[i]=n; return a[i].v; }  // aastore + aaload
  static int  jitCast(Object[] a, int i){ return ((Node)a[i]).v; }      // aaload + checkcast + getfield
  static int  jitObjSet(Object[] a, int i, Object o){ a[i]=o; return 1; } // aastore Object[] (store-check)
  static int  pAget(Node[] a){ return a[0].v + a[1].v; }
  static int  pSetGet(Node[] a, int i, Node n){ a[i]=n; return a[i].v; }
  static int  pCast(Object[] a, int i){ return ((Node)a[i]).v; }
  static int  pObjSet(Object[] a, int i, Object o){ a[i]=o; return 1; }
  static int fail=0;
  static String exc(java.util.function.Supplier<Integer> f){ try{ f.get(); return "ok"; }catch(Throwable t){ return t.getClass().getSimpleName(); } }
  public static void main(String[] x){
    Node[] na = { new Node(), new Node() }; na[0].v=10; na[1].v=20;
    Object[] sa = new String[2];
    for(int k=0;k<40;k++){
      Node c=new Node(); c.v=k;
      if(jitAget(na)!=pAget(na)){System.out.println("FAIL aget");fail++;}
      if(jitSetGet(na,0,c)!=pSetGet(na,0,c)){System.out.println("FAIL setget");fail++;}
      if(jitCast(na,1)!=pCast(na,1)){System.out.println("FAIL cast");fail++;}
    }
    na[0].v=10; na[1].v=20;
    // ArrayStoreException: store Integer into a String[] (viewed as Object[])
    if(!exc(()->jitObjSet(sa,0,Integer.valueOf(5))).equals(exc(()->pObjSet(sa,0,Integer.valueOf(5))))){System.out.println("FAIL ase");fail++;}
    if(jitObjSet(sa,0,"ok")!=pObjSet(sa,0,"ok")){System.out.println("FAIL objset-ok");fail++;}
    System.out.println("aget="+jitAget(na)+" cast="+jitCast(na,1)+" ase="+exc(()->jitObjSet(sa,1,Integer.valueOf(9))));
    System.out.println(fail==0?"ALL PASS":("FAIL="+fail));
  }
}
