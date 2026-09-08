// frem/drem (0x72/0x73): Java float/double remainder = C fmod (incl. NaN on x=inf or y=0,
// and x on finite-x/inf-y per JLS 15.17.3). dup2_x2 (0x5e): `long[] a[i] += v` as an
// expression emits dup2_x2 to keep the cat-2 result below the array+index.
public class FR {
  static float  jitFrem(float a, float b){ return a % b; }
  static float  pFrem  (float a, float b){ return a % b; }
  static double jitDrem(double a, double b){ return a % b; }
  static double pDrem  (double a, double b){ return a % b; }
  static long   jitInc(long[] a, int i, long v){ return a[i] += v; }   // dup2_x2 (cat-2 result)
  static long   pInc  (long[] a, int i, long v){ return a[i] += v; }
  static int fail=0;
  static boolean eqf(float a,float b){ return a==b || (Float.isNaN(a)&&Float.isNaN(b)); }
  static boolean eqd(double a,double b){ return a==b || (Double.isNaN(a)&&Double.isNaN(b)); }
  public static void main(String[] x){
    float INF=Float.POSITIVE_INFINITY; double DINF=Double.POSITIVE_INFINITY;
    float[][] fc={{7,3},{10,4},{-7,3},{5.5f,2},{5,0},{INF,3},{5,INF}};
    double[][] dc={{7,3},{-7,3},{5.5,2},{5,0},{DINF,3},{5,DINF}};
    for(int k=0;k<30;k++){
      for(float[] p:fc) if(!eqf(jitFrem(p[0],p[1]),pFrem(p[0],p[1]))) fail++;
      for(double[] p:dc) if(!eqd(jitDrem(p[0],p[1]),pDrem(p[0],p[1]))) fail++;
    }
    long[] a1={10,20,30}, a2={10,20,30};
    for(int k=0;k<30;k++) if(jitInc(a1,1,5)!=pInc(a2,1,5)) fail++;
    System.out.println("frem(7,3)="+jitFrem(7,3)+" drem(5,inf)="+jitDrem(5,DINF)+" inc="+jitInc(a1,2,7));
    System.out.println(fail==0?"ALL PASS":"FAILURES="+fail);
  }
}
