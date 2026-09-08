public class M5f {
  static class Box { int i; long l; double d; float f; byte b; short s; boolean bo; }
  static int    jitSetI(Box x,int v){ x.i=v; return x.i; }
  static long   jitSetL(Box x,long v){ x.l=v*3; return x.l; }
  static double jitSetD(Box x,double v){ x.d=v; return x.d+1.0; }
  static float  jitSetF(Box x,float v){ x.f=v; return x.f; }
  static int    jitSetBS(Box x,int v){ x.b=(byte)v; x.s=(short)v; return x.b+x.s; }
  static int    pSetI(Box x,int v){ x.i=v; return x.i; }
  static long   pSetL(Box x,long v){ x.l=v*3; return x.l; }
  static double pSetD(Box x,double v){ x.d=v; return x.d+1.0; }
  static float  pSetF(Box x,float v){ x.f=v; return x.f; }
  static int    pSetBS(Box x,int v){ x.b=(byte)v; x.s=(short)v; return x.b+x.s; }
  static int fail=0;
  public static void main(String[] a){
    Box x=new Box(), y=new Box();
    for(int k=0;k<40;k++){
      if(jitSetI(x,k*7)!=pSetI(y,k*7)){System.out.println("FAIL I");fail++;}
      if(jitSetL(x,k+9)!=pSetL(y,k+9)){System.out.println("FAIL L");fail++;}
      if(jitSetD(x,k*1.5)!=pSetD(y,k*1.5)){System.out.println("FAIL D");fail++;}
      if(jitSetF(x,k*0.5f)!=pSetF(y,k*0.5f)){System.out.println("FAIL F");fail++;}
      if(jitSetBS(x,k*300)!=pSetBS(y,k*300)){System.out.println("FAIL BS");fail++;}
    }
    boolean jn=false; for(int k=0;k<40;k++){ try{ jitSetI(null,5); }catch(NullPointerException e){ jn=true; } }
    boolean pn=false; try{ pSetI(null,5); }catch(NullPointerException e){ pn=true; }
    System.out.println("putNPE jit="+jn+" interp="+pn+" match="+(jn==pn)); if(jn!=pn)fail++;
    System.out.println("I="+jitSetI(x,21)+" L="+jitSetL(x,4)+" BS="+jitSetBS(x,300));
    System.out.println(fail==0?"ALL PASS":("FAILURES="+fail));
  }
}
