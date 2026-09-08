// C4.3 wide-prefix differential: `x += 5000` / `x -= 30000` exceed the iinc byte
// range so javac emits `wide iinc` (16-bit index + 16-bit const). jit* methods
// JIT-compile; p* twins interpret.
public class Wide {
  static int  jitWinc(int n){ int x=0; for(int i=0;i<n;i++){ x += 5000; } x -= 30000; return x; }
  static int  pWinc  (int n){ int x=0; for(int i=0;i<n;i++){ x += 5000; } x -= 30000; return x; }
  static int  jitWdec(int n){ int x=100000; for(int i=0;i<n;i++){ x -= 4000; } return x; }
  static int  pWdec  (int n){ int x=100000; for(int i=0;i<n;i++){ x -= 4000; } return x; }
  static int fail=0;
  public static void main(String[] a){
    for(int k=0;k<40;k++){
      if(jitWinc(k)!=pWinc(k)){ System.out.println("FAIL Winc k="+k+" jit="+jitWinc(k)+" interp="+pWinc(k)); fail++; }
      if(jitWdec(k)!=pWdec(k)){ System.out.println("FAIL Wdec k="+k); fail++; }
    }
    System.out.println("Winc(10)="+jitWinc(10)+" Wdec(10)="+jitWdec(10));
    System.out.println(fail==0?"ALL PASS":("FAILURES="+fail));
  }
}
