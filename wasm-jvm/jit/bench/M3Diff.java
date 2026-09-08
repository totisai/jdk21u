public class M3 {
  static int  addI(int a,int b){ return a+b; }
  static long mulL(long a,long b){ return a*b; }
  static double sq(double x){ return x*x; }
  static int  maxI(int a,int b){ return a>b?a:b; }
  static int    jitCallAdd(int a,int b){ return addI(a,b) + addI(b,a); }
  static long   jitCallMul(long a,long b){ return mulL(a,b) + mulL(a,a); }
  static double jitCallSq(double x){ return sq(x) + sq(sq(x)); }
  static int    jitCallMax(int a,int b,int c){ return maxI(maxI(a,b),c); }
  static int    jitLoopCall(int n){ int s=0; for(int i=0;i<n;i++) s = addI(s, maxI(i, n-i)); return s; }
  static int    plainCallAdd(int a,int b){ return addI(a,b) + addI(b,a); }
  static long   plainCallMul(long a,long b){ return mulL(a,b) + mulL(a,a); }
  static double plainCallSq(double x){ return sq(x) + sq(sq(x)); }
  static int    plainCallMax(int a,int b,int c){ return maxI(maxI(a,b),c); }
  static int    plainLoopCall(int n){ int s=0; for(int i=0;i<n;i++) s = addI(s, maxI(i, n-i)); return s; }
  static int fail=0;
  public static void main(String[] x){
    long jr=0,pr=0; double jd=0,pd=0;
    // warm each caller so its invokestatic callees resolve and it recompiles to
    // the JIT'd call path, checking JIT==interpreter on every iteration.
    for(int k=0;k<40;k++){
      if(jitCallAdd(3,4)!=plainCallAdd(3,4)){System.out.println("FAIL CallAdd@"+k);fail++;}
      if(jitCallMul(6,7)!=plainCallMul(6,7)){System.out.println("FAIL CallMul@"+k);fail++;}
      if(jitCallSq(2.0)!=plainCallSq(2.0)){System.out.println("FAIL CallSq@"+k);fail++;}
      if(jitCallMax(3,9,5)!=plainCallMax(3,9,5)){System.out.println("FAIL CallMax@"+k);fail++;}
      if(jitLoopCall(1000)!=plainLoopCall(1000)){System.out.println("FAIL LoopCall@"+k);fail++;}
    }
    System.out.println("CallAdd="+jitCallAdd(3,4)+" CallMul="+jitCallMul(6,7)+" CallSq="+jitCallSq(2.0)+" CallMax="+jitCallMax(3,9,5)+" LoopCall="+jitLoopCall(1000));
    System.out.println(fail==0?"ALL PASS":("FAILURES="+fail));
  }
}
