public class M2 {
  static int    si;  static long sl;  static float sf;  static double sd;
  static byte   sb;  static char sc;  static short ss;  static boolean sz;
  // JIT'd methods that read/write primitive statics
  static int    jitGetPutI(int v){ si = v; return si + si; }
  static long   jitGetPutL(long v){ sl = v * 3; return sl - 1; }
  static double jitGetPutD(double v){ sd = v; return sd * sd; }
  static float  jitGetPutF(float v){ sf = v + 1f; return sf; }
  static int    jitSmall(int v){ sb=(byte)v; sc=(char)v; ss=(short)v; sz=(v&1)==0; return sb + sc + ss + (sz?1:0); }
  static long   jitAccum(int n){ sl=0; for(int i=0;i<n;i++) sl += i; return sl; }   // static in a loop
  // interpreted twins
  static int    pGetPutI(int v){ si = v; return si + si; }
  static long   pGetPutL(long v){ sl = v * 3; return sl - 1; }
  static double pGetPutD(double v){ sd = v; return sd * sd; }
  static float  pGetPutF(float v){ sf = v + 1f; return sf; }
  static int    pSmall(int v){ sb=(byte)v; sc=(char)v; ss=(short)v; sz=(v&1)==0; return sb + sc + ss + (sz?1:0); }
  static long   pAccum(int n){ sl=0; for(int i=0;i<n;i++) sl += i; return sl; }
  static int fail=0;
  public static void main(String[] x){
    for(int k=0;k<40;k++){
      if(jitGetPutI(k*7)!=pGetPutI(k*7)){System.out.println("FAIL I@"+k);fail++;}
      if(jitGetPutL(k+100)!=pGetPutL(k+100)){System.out.println("FAIL L@"+k);fail++;}
      if(jitGetPutD(k*1.5)!=pGetPutD(k*1.5)){System.out.println("FAIL D@"+k);fail++;}
      if(jitGetPutF(k*0.25f)!=pGetPutF(k*0.25f)){System.out.println("FAIL F@"+k);fail++;}
      if(jitSmall(k*333)!=pSmall(k*333)){System.out.println("FAIL Small@"+k);fail++;}
      if(jitAccum(500)!=pAccum(500)){System.out.println("FAIL Accum@"+k);fail++;}
    }
    System.out.println("I="+jitGetPutI(21)+" L="+jitGetPutL(5)+" D="+jitGetPutD(3.0)+" Small="+jitSmall(300)+" Accum="+jitAccum(500));
    System.out.println(fail==0?"ALL PASS":("FAILURES="+fail));
  }
}
