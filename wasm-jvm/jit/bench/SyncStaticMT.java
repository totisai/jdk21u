// static synchronized method: locks the holder's Class mirror (no `this`). 4 threads
// hammer a static-synchronized increment; a working lock => no lost updates.
public class SS {
  static long counter = 0;
  static synchronized void jitAdd(long v){ counter += v; }
  public static void main(String[] a) throws Exception {
    int T=4, N=100000;
    Thread[] ts = new Thread[T];
    for (int i=0;i<T;i++){ ts[i]=new Thread(()->{ for(int k=0;k<N;k++) jitAdd(1); }); ts[i].start(); }
    for (Thread t: ts) t.join();
    long e=(long)T*N;
    System.out.println("counter="+counter+" expect="+e);
    System.out.println(counter==e?"ALL PASS":"FAILURES=1");
  }
}
