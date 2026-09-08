public class C0b {
  static class N { int x; }
  static int  jitDupX1(N n, int v){ return n.x = v; }                 // dup_x1
  static int  jitDupX2(int[] a, int i, int v){ return a[i] = v; }      // dup_x2
  static long jitDup2(long v){ long a,b; a=b=v*3; return a-b+b; }      // dup2
  static int  pDupX1(N n, int v){ return n.x = v; }
  static int  pDupX2(int[] a, int i, int v){ return a[i] = v; }
  static long pDup2(long v){ long a,b; a=b=v*3; return a-b+b; }
  static int fail=0;
  public static void main(String[] x){
    N n1=new N(), n2=new N(); int[] a1={0,0,0,0}, a2={0,0,0,0};
    for(int k=0;k<40;k++){
      if(jitDupX1(n1,k*3)!=pDupX1(n2,k*3) || n1.x!=n2.x){System.out.println("FAIL x1");fail++;}
      if(jitDupX2(a1,k&3,k*5)!=pDupX2(a2,k&3,k*5) || a1[k&3]!=a2[k&3]){System.out.println("FAIL x2");fail++;}
      if(jitDup2(k+100)!=pDup2(k+100)){System.out.println("FAIL dup2");fail++;}
    }
    System.out.println("x1="+jitDupX1(n1,7)+"/"+n1.x+" x2="+jitDupX2(a1,2,9)+"/"+a1[2]+" dup2="+jitDup2(5));
    System.out.println(fail==0?"ALL PASS":("FAIL="+fail));
  }
}
