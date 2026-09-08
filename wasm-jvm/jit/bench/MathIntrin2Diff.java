// C5.4 intrinsics: verify the new inlined static intrinsics against HARDCODED expected
// values (absolute correctness -- catches a wrong wasm opcode even under JITALL where the
// p* twins also compile), plus a jit-vs-twin cross-check. Float/double compared by RAW
// BITS so NaN/-0.0 are exact. Methods named jit* are eager-compiled to inline wasm.
//   Math.sqrt/floor/ceil/rint/copySign  (sqrt is NATIVE -> exercises the leader-scan bypass)
//   Integer/Long.bitCount/numberOfLeadingZeros/numberOfTrailingZeros  (clz/ctz/popcnt)
public class MI2 {
  static double jitSqrt (double a){ return Math.sqrt(a); }   static double pSqrt (double a){ return Math.sqrt(a); }
  static double jitFloor(double a){ return Math.floor(a); }  static double pFloor(double a){ return Math.floor(a); }
  static double jitCeil (double a){ return Math.ceil(a); }   static double pCeil (double a){ return Math.ceil(a); }
  static double jitRint (double a){ return Math.rint(a); }   static double pRint (double a){ return Math.rint(a); }
  static double jitCopyD(double m,double s){ return Math.copySign(m,s); } static double pCopyD(double m,double s){ return Math.copySign(m,s); }
  static float  jitCopyF(float m,float s){ return Math.copySign(m,s); }   static float  pCopyF(float m,float s){ return Math.copySign(m,s); }

  static int jitBcI (int a){ return Integer.bitCount(a); }              static int pBcI (int a){ return Integer.bitCount(a); }
  static int jitNlzI(int a){ return Integer.numberOfLeadingZeros(a); }  static int pNlzI(int a){ return Integer.numberOfLeadingZeros(a); }
  static int jitNtzI(int a){ return Integer.numberOfTrailingZeros(a); } static int pNtzI(int a){ return Integer.numberOfTrailingZeros(a); }
  static int jitBcJ (long a){ return Long.bitCount(a); }               static int pBcJ (long a){ return Long.bitCount(a); }
  static int jitNlzJ(long a){ return Long.numberOfLeadingZeros(a); }   static int pNlzJ(long a){ return Long.numberOfLeadingZeros(a); }
  static int jitNtzJ(long a){ return Long.numberOfTrailingZeros(a); }  static int pNtzJ(long a){ return Long.numberOfTrailingZeros(a); }
  // bit-exact reinterprets (native -> single wasm reinterpret op)
  static int    jitF2I(float f){ return Float.floatToRawIntBits(f); }  static int    pF2I(float f){ return Float.floatToRawIntBits(f); }
  static float  jitI2F(int i){ return Float.intBitsToFloat(i); }       static float  pI2F(int i){ return Float.intBitsToFloat(i); }
  static long   jitD2J(double d){ return Double.doubleToRawLongBits(d); } static long   pD2J(double d){ return Double.doubleToRawLongBits(d); }
  static double jitJ2D(long l){ return Double.longBitsToDouble(l); }   static double pJ2D(long l){ return Double.longBitsToDouble(l); }

  static int fail = 0;
  static void ck(boolean ok){ if(!ok) fail++; }
  static int  rbF(float f){ return Float.floatToRawIntBits(f); }
  static long rbD(double d){ return Double.doubleToRawLongBits(d); }

  static final double[] DV = { 0d,-0d,1d,-1d,2d,16d,2.0,3.7,-3.2,3.2,-3.7,2.5,3.5,2.4,
                               Double.NaN, Double.POSITIVE_INFINITY, Double.NEGATIVE_INFINITY };
  static final int[]  IV = { 0,1,-1,7,8,0x80000000,Integer.MAX_VALUE,100,1024,255 };
  static final long[] JV = { 0L,1L,-1L,7L,1L<<40,Long.MIN_VALUE,Long.MAX_VALUE,255L,1L<<63 };

  public static void main(String[] a){
    // absolute correctness (hardcoded) -- these bind even if both twins are JIT'd.
    ck(rbD(jitSqrt(16d))==rbD(4d));   ck(rbD(jitSqrt(0d))==rbD(0d));  ck(Double.isNaN(jitSqrt(-1d)));
    ck(rbD(jitFloor(3.7))==rbD(3d));  ck(rbD(jitFloor(-3.2))==rbD(-4d));
    ck(rbD(jitCeil(3.2))==rbD(4d));   ck(rbD(jitCeil(-3.7))==rbD(-3d));
    ck(rbD(jitRint(2.5))==rbD(2d));   ck(rbD(jitRint(3.5))==rbD(4d));  ck(rbD(jitRint(2.4))==rbD(2d));
    ck(rbD(jitCopyD(3d,-1d))==rbD(-3d)); ck(rbF(jitCopyF(-3f,1f))==rbF(3f));
    ck(jitBcI(0)==0);   ck(jitBcI(7)==3);   ck(jitBcI(-1)==32);
    ck(jitNlzI(1)==31); ck(jitNlzI(0)==32); ck(jitNlzI(0x80000000)==0);
    ck(jitNtzI(0)==32); ck(jitNtzI(8)==3);  ck(jitNtzI(1)==0);
    ck(jitBcJ(-1L)==64); ck(jitBcJ(0L)==0); ck(jitNlzJ(1L)==63); ck(jitNlzJ(0L)==64);
    ck(jitNtzJ(0L)==64); ck(jitNtzJ(1L<<40)==40);
    ck(jitF2I(1.0f)==0x3f800000); ck(rbF(jitI2F(0x3f800000))==rbF(1.0f));
    ck(jitD2J(1.0)==0x3ff0000000000000L); ck(rbD(jitJ2D(0x3ff0000000000000L))==rbD(1.0));

    // cross-check jit vs twin over many reps (drives compilation of both) and many inputs.
    for (int rep=0; rep<60; rep++){
      for (double x : DV){
        ck(rbD(jitSqrt(x))==rbD(pSqrt(x)));   ck(rbD(jitFloor(x))==rbD(pFloor(x)));
        ck(rbD(jitCeil(x))==rbD(pCeil(x)));   ck(rbD(jitRint(x))==rbD(pRint(x)));
        for (double s : DV){ ck(rbD(jitCopyD(x,s))==rbD(pCopyD(x,s))); }
      }
      for (int x : IV){ ck(jitBcI(x)==pBcI(x)); ck(jitNlzI(x)==pNlzI(x)); ck(jitNtzI(x)==pNtzI(x));
                        ck(rbF(jitI2F(x))==rbF(pI2F(x))); }
      for (long x : JV){ ck(jitBcJ(x)==pBcJ(x)); ck(jitNlzJ(x)==pNlzJ(x)); ck(jitNtzJ(x)==pNtzJ(x));
                         ck(rbD(jitJ2D(x))==rbD(pJ2D(x))); }
      for (float x : new float[]{0f,-0f,1f,-1f,3.5f,Float.NaN}){ ck(jitF2I(x)==pF2I(x)); }
      for (double x : DV){ ck(jitD2J(x)==pD2J(x)); }
    }
    System.out.println("sqrt2=" + jitSqrt(2d) + " nlz(1024)=" + jitNlzI(1024) + " bcJ(MAX)=" + jitBcJ(Long.MAX_VALUE));
    System.out.println(fail==0 ? "ALL PASS" : "FAILURES=" + fail);
  }
}
