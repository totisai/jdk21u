public class C2Barrier {
  static class Node { int v; }
  static class Holder { Node node; }
  static int jitLink(Holder h, Node n){ h.node = n; return h.node.v; }  // object putfield(barrier)+getfield -> JITs
  public static void main(String[] a) throws Exception {
    Holder old = new Holder();
    for(int i=0;i<200000;i++){ Object junk=new byte[32]; }
    System.gc(); System.gc();
    Node warm=new Node(); warm.v=-1; for(int i=0;i<50;i++) jitLink(old, warm);
    int fails=0;
    for(int k=0;k<3000;k++){
      Node young = new Node(); young.v = k;
      int got = jitLink(old, young);          // JIT'd: old.node=young + read back
      young = null;
      for(int j=0;j<2000;j++){ Object junk=new byte[64]; }
      if(got!=k || old.node==null || old.node.v!=k){ fails++; if(fails<=3) System.out.println("MISS@"+k+" got="+got+" node="+(old.node==null?"null":old.node.v)); }
    }
    System.out.println("barrier fails="+fails+" "+(fails==0?"ALL PASS":"CORRUPT"));
  }
}
