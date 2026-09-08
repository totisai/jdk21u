public class M4 {
  static class Point { int x; long y; double d; float f; byte b; char c; short s; boolean bo;
    Point(int x){ this.x=x; this.y=x*1000L; this.d=x*0.5; this.f=x+0.25f; this.b=(byte)x; this.c=(char)(x+5); this.s=(short)(x*2); this.bo=(x&1)==0; } }
  // JIT'd getters (poll-free, handler-free -> eligible)
  static int    jitGetX(Point p){ return p.x + p.x; }
  static long   jitGetY(Point p){ return p.y - 1; }
  static double jitGetD(Point p){ return p.d * p.d; }
  static float  jitGetF(Point p){ return p.f + 1f; }
  static int    jitGetBCS(Point p){ return p.b + p.c + p.s + (p.bo?1:0); }  // has ternary -> may bail, still correct
  static int    jitSum(Point a, Point b){ return a.x + b.x; }               // two receivers
  // twins
  static int    pGetX(Point p){ return p.x + p.x; }
  static long   pGetY(Point p){ return p.y - 1; }
  static double pGetD(Point p){ return p.d * p.d; }
  static float  pGetF(Point p){ return p.f + 1f; }
  static int    pSum(Point a, Point b){ return a.x + b.x; }
  static int fail=0;
  public static void main(String[] x){
    Point p=new Point(9), q=new Point(4);
    for(int k=0;k<40;k++){
      if(jitGetX(p)!=pGetX(p)){System.out.println("FAIL X");fail++;}
      if(jitGetY(p)!=pGetY(p)){System.out.println("FAIL Y");fail++;}
      if(jitGetD(p)!=pGetD(p)){System.out.println("FAIL D");fail++;}
      if(jitGetF(p)!=pGetF(p)){System.out.println("FAIL F");fail++;}
      if(jitSum(p,q)!=pSum(p,q)){System.out.println("FAIL Sum");fail++;}
    }
    // NPE test: jitGetX(null) must throw NPE (via JIT'd null check), matching interpreter
    boolean jitNpe=false; for(int k=0;k<40;k++){ try{ jitGetX(null); }catch(NullPointerException e){ jitNpe=true; } }
    boolean pNpe=false; try{ pGetX(null); }catch(NullPointerException e){ pNpe=true; }
    System.out.println("NPE jit="+jitNpe+" interp="+pNpe+" match="+(jitNpe==pNpe));
    if(jitNpe!=pNpe) fail++;
    System.out.println("X="+jitGetX(p)+" Y="+jitGetY(p)+" Sum="+jitSum(p,q));
    System.out.println(fail==0?"ALL PASS":("FAILURES="+fail));
  }
}
