public class C2i {
  static int jitStr(Object o){ if(o instanceof String) return 1; return 0; }
  static int jitNum(Object o){ if(o instanceof Number) return 1; return 0; }         // subtype/iface
  static int jitCS(Object o){ if(o instanceof CharSequence) return 1; return 0; }     // interface
  static int jitLoop(Object o, int n){ int c=0; for(int i=0;i<n;i++){ if(o instanceof String) c++; } return c; } // instanceof in loop (C1 frame-read)
  static int pStr(Object o){ if(o instanceof String) return 1; return 0; }
  static int pNum(Object o){ if(o instanceof Number) return 1; return 0; }
  static int pCS(Object o){ if(o instanceof CharSequence) return 1; return 0; }
  static int pLoop(Object o, int n){ int c=0; for(int i=0;i<n;i++){ if(o instanceof String) c++; } return c; }
  static int fail=0;
  static void ck(String n,int a,int b){ if(a!=b){System.out.println("FAIL "+n+" "+a+"!="+b);fail++;} }
  public static void main(String[] x){
    Object[] os = { "hi", Integer.valueOf(3), new Object(), null, Double.valueOf(1.5) };
    for(int k=0;k<40;k++) for(Object o : os){
      ck("str", jitStr(o), pStr(o)); ck("num", jitNum(o), pNum(o)); ck("cs", jitCS(o), pCS(o));
      ck("loop", jitLoop(o,50), pLoop(o,50));
    }
    System.out.println("str(hi)="+jitStr("hi")+" num(3)="+jitNum(3)+" cs(hi)="+jitCS("hi")+" loop=" +jitLoop("hi",10));
    System.out.println(fail==0?"ALL PASS":("FAIL="+fail));
  }
}
