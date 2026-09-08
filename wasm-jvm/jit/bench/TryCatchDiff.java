// C4.1 in-method try/catch differential: jit* methods must catch exceptions
// INSIDE the JIT'd code (handler dispatch), not just propagate. p* twins interpret.
public class TryC {
  static int jitTc(int a, int b){ int r; try { r = a / b; } catch (ArithmeticException e){ r = -1; } return r; }
  static int pTc  (int a, int b){ int r; try { r = a / b; } catch (ArithmeticException e){ r = -1; } return r; }
  static int jitTn(int[] arr){ int r; try { r = arr[0] + 1; }
      catch (NullPointerException e){ r = -2; } catch (ArrayIndexOutOfBoundsException e){ r = -3; } return r; }
  static int pTn  (int[] arr){ int r; try { r = arr[0] + 1; }
      catch (NullPointerException e){ r = -2; } catch (ArrayIndexOutOfBoundsException e){ r = -3; } return r; }
  static int fail=0;
  public static void main(String[] a){
    int[] arr={7}, empty={};
    for(int k=0;k<40;k++) if(jitTc(100,k)!=pTc(100,k)){ System.out.println("FAIL Tc k="+k); fail++; }
    if(jitTn(arr)  !=pTn(arr))  { System.out.println("FAIL Tn");       fail++; }
    if(jitTn(null) !=pTn(null)) { System.out.println("FAIL Tn-null");  fail++; }
    if(jitTn(empty)!=pTn(empty)){ System.out.println("FAIL Tn-empty"); fail++; }
    System.out.println("Tc(100,0)="+jitTc(100,0)+" Tc(100,4)="+jitTc(100,4)
                       +" Tn(null)="+jitTn(null)+" Tn(empty)="+jitTn(empty)+" Tn(arr)="+jitTn(arr));
    System.out.println(fail==0?"ALL PASS":("FAILURES="+fail));
  }
}
