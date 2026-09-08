// Verify the Math.min/max/abs intrinsics: jit* methods (eager-compiled -> inline wasm)
// vs plain twins (interpreted -> real java.lang.Math). Exercises edge cases that must
// match Java exactly: Integer/Long.MIN_VALUE abs (wraps back), float/double NaN, -0.0
// vs +0.0, +/-Infinity. float/double results compared by RAW BITS (NaN!=NaN, -0.0==0.0).
public class MI {
  static int  jitMinI(int a,int b){ return Math.min(a,b); }   static int  pMinI(int a,int b){ return Math.min(a,b); }
  static int  jitMaxI(int a,int b){ return Math.max(a,b); }   static int  pMaxI(int a,int b){ return Math.max(a,b); }
  static int  jitAbsI(int a){ return Math.abs(a); }           static int  pAbsI(int a){ return Math.abs(a); }
  static long jitMinJ(long a,long b){ return Math.min(a,b); } static long pMinJ(long a,long b){ return Math.min(a,b); }
  static long jitMaxJ(long a,long b){ return Math.max(a,b); } static long pMaxJ(long a,long b){ return Math.max(a,b); }
  static long jitAbsJ(long a){ return Math.abs(a); }          static long pAbsJ(long a){ return Math.abs(a); }
  static float  jitMinF(float a,float b){ return Math.min(a,b); }   static float  pMinF(float a,float b){ return Math.min(a,b); }
  static float  jitMaxF(float a,float b){ return Math.max(a,b); }   static float  pMaxF(float a,float b){ return Math.max(a,b); }
  static float  jitAbsF(float a){ return Math.abs(a); }             static float  pAbsF(float a){ return Math.abs(a); }
  static double jitMinD(double a,double b){ return Math.min(a,b); } static double pMinD(double a,double b){ return Math.min(a,b); }
  static double jitMaxD(double a,double b){ return Math.max(a,b); } static double pMaxD(double a,double b){ return Math.max(a,b); }
  static double jitAbsD(double a){ return Math.abs(a); }            static double pAbsD(double a){ return Math.abs(a); }

  static int fail = 0;
  static void ck(boolean ok){ if(!ok) fail++; }
  static final int[]    IV = { 0,1,-1,7,-7,Integer.MIN_VALUE,Integer.MAX_VALUE,100,-100 };
  static final long[]   JV = { 0,1,-1,7,-7,Long.MIN_VALUE,Long.MAX_VALUE,1L<<40,-(1L<<40) };
  static final float[]  FV = { 0f,-0f,1f,-1f,Float.NaN,Float.POSITIVE_INFINITY,Float.NEGATIVE_INFINITY,3.5f,-3.5f };
  static final double[] DV = { 0d,-0d,1d,-1d,Double.NaN,Double.POSITIVE_INFINITY,Double.NEGATIVE_INFINITY,3.5,-3.5 };

  public static void main(String[] a){
    for (int rep=0; rep<50; rep++){
      for (int x : IV){ ck(jitAbsI(x)==pAbsI(x)); for (int y : IV){ ck(jitMinI(x,y)==pMinI(x,y)); ck(jitMaxI(x,y)==pMaxI(x,y)); } }
      for (long x : JV){ ck(jitAbsJ(x)==pAbsJ(x)); for (long y : JV){ ck(jitMinJ(x,y)==pMinJ(x,y)); ck(jitMaxJ(x,y)==pMaxJ(x,y)); } }
      for (float x : FV){ ck(rbF(jitAbsF(x))==rbF(pAbsF(x))); for (float y : FV){ ck(rbF(jitMinF(x,y))==rbF(pMinF(x,y))); ck(rbF(jitMaxF(x,y))==rbF(pMaxF(x,y))); } }
      for (double x : DV){ ck(rbD(jitAbsD(x))==rbD(pAbsD(x))); for (double y : DV){ ck(rbD(jitMinD(x,y))==rbD(pMinD(x,y))); ck(rbD(jitMaxD(x,y))==rbD(pMaxD(x,y))); } }
    }
    System.out.println("absMinI(MIN,MAX)=" + jitAbsI(Integer.MIN_VALUE) + " minF(-0,0)=" + rbF(jitMinF(-0f,0f)) + " maxF(NaN,1)=" + Float.isNaN(jitMaxF(Float.NaN,1f)));
    System.out.println(fail==0 ? "ALL PASS" : "FAILURES=" + fail);
  }
  static int rbF(float f){ return Float.floatToRawIntBits(f); }
  static long rbD(double d){ return Double.doubleToRawLongBits(d); }
}
