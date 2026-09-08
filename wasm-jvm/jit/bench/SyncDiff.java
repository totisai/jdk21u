// C4.2 synchronized-block differential. jit* methods JIT-compile monitorenter/exit
// (via jni_enter/jni_exit); the throw-inside-sync case exercises the synthetic
// monitorexit handler on the exception unwind. Lock is a param (getstatic-object bails).
public class Sync {
  static int jitSync(Object lk, int n){ int r=0; for(int i=0;i<n;i++){ synchronized(lk){ r+=i; } } return r; }
  static int pSync  (Object lk, int n){ int r=0; for(int i=0;i<n;i++){ synchronized(lk){ r+=i; } } return r; }
  // exception thrown INSIDE the sync block: the block's synthetic handler must
  // monitorexit (unlock) before the exception reaches the outer catch.
  static int jitSyncThrow(Object lk, int n){ int r; try { synchronized(lk){ r = 100 / n; } } catch (ArithmeticException e){ r = -1; } return r; }
  static int pSyncThrow  (Object lk, int n){ int r; try { synchronized(lk){ r = 100 / n; } } catch (ArithmeticException e){ r = -1; } return r; }
  static int fail=0;
  public static void main(String[] a){
    Object lk = new Object();
    for(int k=0;k<=10;k++){
      if(jitSync(lk,k)      != pSync(lk,k))      { System.out.println("FAIL Sync k="+k);      fail++; }
      if(jitSyncThrow(lk,k) != pSyncThrow(lk,k)) { System.out.println("FAIL SyncThrow k="+k); fail++; }
    }
    // if the lock leaked on the throw path, re-locking here (same thread) still works
    // (re-entrant), but the balance would be wrong; a clean result is the first signal.
    System.out.println("Sync(lk,5)="+jitSync(lk,5)+" SyncThrow(lk,0)="+jitSyncThrow(lk,0)
                       +" SyncThrow(lk,4)="+jitSyncThrow(lk,4));
    System.out.println(fail==0?"ALL PASS":("FAILURES="+fail));
  }
}
