public class M6a {
  static int    jitLen(int[] a){ return a.length; }
  static int    jitIget(int[] a){ return a[0] + a[1] + a[2]; }
  static long   jitLget(long[] a){ return a[0] - a[1]; }
  static double jitDget(double[] a){ return a[0] * a[1]; }
  static int    jitBget(byte[] a){ return a[0] + a[1]; }
  static int    jitCget(char[] a){ return a[0] + a[1]; }
  static void   jitIset(int[] a, int i, int v){ a[i] = v; }
  static void   jitBset(byte[] a, int i, int v){ a[i] = (byte)v; }
  static int    pLen(int[] a){ return a.length; }
  static int    pIget(int[] a){ return a[0]+a[1]+a[2]; }
  static long   pLget(long[] a){ return a[0]-a[1]; }
  static double pDget(double[] a){ return a[0]*a[1]; }
  static int    pBget(byte[] a){ return a[0]+a[1]; }
  static int    pCget(char[] a){ return a[0]+a[1]; }
  static int fail=0;
  public static void main(String[] x){
    int[] ia={10,20,30,40}; long[] la={100,7}; double[] da={2.5,4.0}; byte[] ba={5,-8}; char[] ca={'A','B'};
    int[] ib={0,0,0,0}; byte[] bb={0,0};
    for(int k=0;k<40;k++){
      if(jitLen(ia)!=pLen(ia)){System.out.println("FAIL len");fail++;}
      if(jitIget(ia)!=pIget(ia)){System.out.println("FAIL iget");fail++;}
      if(jitLget(la)!=pLget(la)){System.out.println("FAIL lget");fail++;}
      if(jitDget(da)!=pDget(da)){System.out.println("FAIL dget");fail++;}
      if(jitBget(ba)!=pBget(ba)){System.out.println("FAIL bget");fail++;}
      if(jitCget(ca)!=pCget(ca)){System.out.println("FAIL cget");fail++;}
      jitIset(ib,k&3,k*11); if(ib[k&3]!=k*11){System.out.println("FAIL iset");fail++;}
      jitBset(bb,k&1,k); if(bb[k&1]!=(byte)k){System.out.println("FAIL bset");fail++;}
    }
    // NPE + AIOOBE from JIT'd checks
    boolean npe=false; for(int k=0;k<40;k++) try{ jitIget(null); }catch(NullPointerException e){ npe=true; }
    boolean aioobe=false; for(int k=0;k<40;k++) try{ jitIset(ia, 99, 1); }catch(ArrayIndexOutOfBoundsException e){ aioobe=true; }
    System.out.println("NPE="+npe+" AIOOBE="+aioobe);
    if(!npe||!aioobe) fail++;
    System.out.println("len="+jitLen(ia)+" iget="+jitIget(ia)+" bget="+jitBget(ba));
    System.out.println(fail==0?"ALL PASS":("FAILURES="+fail));
  }
}
