public class GcStress {
  static volatile boolean done=false;
  static long jitGcLoop(long n){ long s=0; for(long i=0;i<n;i++){ s += (i*7) ^ (i>>>2); } return s; }
  static long plainGcLoop(long n){ long s=0; for(long i=0;i<n;i++){ s += (i*7) ^ (i>>>2); } return s; }
  public static void main(String[] a) throws Exception {
    Thread gc = new Thread(()->{ while(!done){ System.gc(); try{Thread.sleep(1);}catch(Exception e){} } });
    gc.setDaemon(true); gc.start();
    long r = jitGcLoop(20_000_000L);   // JIT'd loop must poll safepoints or GC deadlocks
    done=true;
    long p = plainGcLoop(20_000_000L);
    System.out.println("GcStress jit="+r+" plain="+p+" match="+(r==p));
  }
}
