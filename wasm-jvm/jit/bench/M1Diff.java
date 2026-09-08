public class M1 {
  // long
  static long jitLsum(long n){ long s=0; for(long i=0;i<n;i++) s+=i; return s; }
  static long plainLsum(long n){ long s=0; for(long i=0;i<n;i++) s+=i; return s; }
  static long jitLbits(long a, long b){ return ((a<<7)|(b>>>3))^(a&b) + (a*b) - (a%1==0?0:1); }
  static long plainLbits(long a, long b){ return ((a<<7)|(b>>>3))^(a&b) + (a*b) - (a%1==0?0:1); }
  static int  jitLcmp(long a, long b){ return (a<b)?-1:(a>b?1:0); }
  static int  plainLcmp(long a, long b){ return (a<b)?-1:(a>b?1:0); }
  // float / double
  static double jitDpoly(double x){ return x*x*x + 2.0*x + 1.0; }
  static double plainDpoly(double x){ return x*x*x + 2.0*x + 1.0; }
  static float  jitFmul(float a, float b){ return a*b + a - b; }
  static float  plainFmul(float a, float b){ return a*b + a - b; }
  // conversions
  static long   jitConv(int n){ return (long)n * 1000L + (long)(n*2); }
  static long   plainConv(int n){ return (long)n * 1000L + (long)(n*2); }
  static double jitI2d(int n){ return (double)n / 4.0 + n; }
  static double plainI2d(int n){ return (double)n / 4.0 + n; }
  static int    jitD2i(double x){ return (int)(x*3.0) + (int)(x); }
  static int    plainD2i(double x){ return (int)(x*3.0) + (int)(x); }
  // int (regression: existing path under new ABI)
  static int jitIpoly(int a,int b){ int s=0; for(int i=0;i<b;i++) s += a*i - (i<<1); return s; }
  static int plainIpoly(int a,int b){ int s=0; for(int i=0;i<b;i++) s += a*i - (i<<1); return s; }

  static int fail = 0;
  static void ckL(String n,long a,long b){ if(a!=b){System.out.println("FAIL "+n+" jit="+a+" plain="+b);fail++;} else System.out.println("ok   "+n+" = "+a); }
  static void ckI(String n,int a,int b){ if(a!=b){System.out.println("FAIL "+n+" jit="+a+" plain="+b);fail++;} else System.out.println("ok   "+n+" = "+a); }
  static void ckD(String n,double a,double b){ if(a!=b){System.out.println("FAIL "+n+" jit="+a+" plain="+b);fail++;} else System.out.println("ok   "+n+" = "+a); }
  static void ckF(String n,float a,float b){ if(a!=b){System.out.println("FAIL "+n+" jit="+a+" plain="+b);fail++;} else System.out.println("ok   "+n+" = "+a); }
  public static void main(String[] x){
    ckL("Lsum",  jitLsum(100000),  plainLsum(100000));
    ckL("Lbits", jitLbits(0x1234567L,0xABCDEF01L), plainLbits(0x1234567L,0xABCDEF01L));
    ckI("Lcmp1", jitLcmp(5,9), plainLcmp(5,9));
    ckI("Lcmp2", jitLcmp(9,5), plainLcmp(9,5));
    ckI("Lcmp3", jitLcmp(7,7), plainLcmp(7,7));
    ckD("Dpoly", jitDpoly(3.5), plainDpoly(3.5));
    ckF("Fmul",  jitFmul(2.5f,1.5f), plainFmul(2.5f,1.5f));
    ckL("Conv",  jitConv(-77), plainConv(-77));
    ckD("I2d",   jitI2d(9), plainI2d(9));
    ckI("D2i",   jitD2i(4.9), plainD2i(4.9));
    ckI("Ipoly", jitIpoly(7,1000), plainIpoly(7,1000));
    System.out.println(fail==0?"ALL PASS":("FAILURES="+fail));
  }
}
