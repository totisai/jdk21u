public class C0a {
  static int jitNull(int[] a){ if(a==null) return -1; return a.length; }        // ifnonnull
  static int jitNN(int[] a){ if(a!=null) return a[0]; return -7; }              // ifnull
  static int jitSame(int[] a, int[] b){ if(a==b) return 1; return 0; }          // if_acmpeq
  static int jitDiff(int[] a, int[] b){ if(a!=b) return 9; return 8; }          // if_acmpne
  static int pNull(int[] a){ if(a==null) return -1; return a.length; }
  static int pNN(int[] a){ if(a!=null) return a[0]; return -7; }
  static int pSame(int[] a, int[] b){ if(a==b) return 1; return 0; }
  static int pDiff(int[] a, int[] b){ if(a!=b) return 9; return 8; }
  static int fail=0;
  public static void main(String[] x){
    int[] p={42,1}, q={5};
    for(int k=0;k<40;k++){
      if(jitNull(p)!=pNull(p)||jitNull(null)!=pNull(null)){System.out.println("FAIL null");fail++;}
      if(jitNN(p)!=pNN(p)||jitNN(null)!=pNN(null)){System.out.println("FAIL nn");fail++;}
      if(jitSame(p,p)!=pSame(p,p)||jitSame(p,q)!=pSame(p,q)){System.out.println("FAIL same");fail++;}
      if(jitDiff(p,q)!=pDiff(p,q)||jitDiff(p,p)!=pDiff(p,p)){System.out.println("FAIL diff");fail++;}
    }
    System.out.println("null="+jitNull(p)+"/"+jitNull(null)+" same="+jitSame(p,p)+"/"+jitSame(p,q));
    System.out.println(fail==0?"ALL PASS":("FAIL="+fail));
  }
}
