// invokedynamic GC-safety: 2M string concats (each allocates a String via the adapter)
// under concurrent System.gc(). The dynamic oop arg + appendix are Handle-rooted.
public class IDG {
  static String cat(int i, String s){ return "v" + i + ":" + s; }
  public static void main(String[] a) throws Exception {
    Thread gc=new Thread(()->{ for(int i=0;i<4000;i++){ System.gc();
      try{Thread.sleep(0,100000);}catch(InterruptedException e){} } }); gc.setDaemon(true); gc.start();
    long len=0; for(int i=0;i<2_000_000;i++){ len += cat(i & 7, "x").length(); }
    System.out.println("len="+len+" (nonzero, no crash)");
    System.out.println(len>0?"ALL PASS":"FAILURES=1");
  }
}
