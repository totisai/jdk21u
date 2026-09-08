// fused this.field (RewriteFrequentPairs, on for Zero): aload_0;getfield -> one opcode
// _fast_iaccess_0/_aaccess_0/_faccess_0 (0xdd/0xde/0xdf). These only appear after the
// pair is fused (a few interpreted runs), so they're compiled by THRESHOLD-triggered
// (real-app) compilation, not eager entry. Non-accessor jit* methods (arithmetic, so
// not the interpreter accessor fast-path) read this.field; run enough to fuse-then-JIT.
public class FA {
  int iv; Object ov; float fv;
  FA(int i, Object o, float f){ iv=i; ov=o; fv=f; }
  int     jitI    (){ return iv * 2 + 1; }         // _fast_iaccess_0 + arith
  int     pI      (){ return iv * 2 + 1; }
  float   jitF    (){ return fv * 2.0f - 1.0f; }   // _fast_faccess_0 + arith
  float   pF      (){ return fv * 2.0f - 1.0f; }
  int     jitO    (){ return ov == null ? 9 : 8; } // _fast_aaccess_0 -> branch
  int     pO      (){ return ov == null ? 9 : 8; }
  static int fail=0;
  public static void main(String[] a){
    FA x = new FA(42, "obj", 3.5f), y = new FA(7, null, -1.0f);
    for (int k=0;k<400;k++){
      if(x.jitI()!=x.pI()){fail++;}
      if(x.jitF()!=x.pF()){fail++;}
      if(x.jitO()!=x.pO()){fail++;}
      if(y.jitI()!=y.pI()){fail++;}
      if(y.jitO()!=y.pO()){fail++;}
    }
    System.out.println("xI="+x.jitI()+" xF="+x.jitF()+" xO="+x.jitO()+" yI="+y.jitI()+" yO="+y.jitO()); // 85,6.0,8,15,9
    System.out.println(fail==0?"ALL PASS":"FAILURES="+fail);
  }
}
