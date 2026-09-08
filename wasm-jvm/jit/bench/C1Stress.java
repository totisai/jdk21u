public class C1Stress {
  static class Data { int x; }
  static volatile boolean done=false;
  // d (object arg) is LIVE across the loop back-edge (a safepoint). Previously
  // this bailed (poll-free gate); now it JITs and re-reads d from the GC-scanned
  // frame each iteration, so a moving GC that relocates d is transparent.
  static long jitSum(Data d, int n){ long s=0; for(int i=0;i<n;i++){ s += d.x; } return s; }
  static long pSum(Data d, int n){ long s=0; for(int i=0;i<n;i++){ s += d.x; } return s; }
  public static void main(String[] a) throws Exception {
    Data d = new Data(); d.x = 42;
    Thread gc = new Thread(()->{ while(!done){ Object[] junk=new Object[256];
      for(int k=0;k<256;k++) junk[k]=new byte[128]; System.gc();
      try{Thread.sleep(1);}catch(Exception e){} }});
    gc.setDaemon(true); gc.start();
    long r = jitSum(d, 30_000_000);     // runs while GC relocates d
    done=true;
    long p = pSum(d, 30_000_000);
    long expect = 42L*30_000_000;
    System.out.println("C1 jit="+r+" plain="+p+" expect="+expect+" match="+(r==p && r==expect));
  }
}
