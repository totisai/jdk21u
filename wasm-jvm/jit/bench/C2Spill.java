public class C2Spill {
  static class Node { int v; Node next; }
  static volatile boolean done=false;
  static int  jitLocal(Node a){ Node b=a.next; return b.v; }                         // astore/aload spill
  static long jitSpill(Node a, int n){ Node b=a.next; long s=0; for(int i=0;i<n;i++) s+=b.v; return s; } // spill across loop
  static int  pLocal(Node a){ Node b=a.next; return b.v; }
  static long pSpill(Node a, int n){ Node b=a.next; long s=0; for(int i=0;i<n;i++) s+=b.v; return s; }
  public static void main(String[] x) throws Exception {
    Node a=new Node(), b=new Node(); b.v=42; a.next=b;
    int fail=0;
    for(int k=0;k<40;k++) if(jitLocal(a)!=pLocal(a)){fail++;System.out.println("FAIL local");}
    // GC stress: b (=a.next, an astore'd spill local) held across a 30M loop while GC relocates it
    Thread gc=new Thread(()->{ while(!done){ Object[] j=new Object[256]; for(int i=0;i<256;i++) j[i]=new byte[128]; System.gc(); try{Thread.sleep(1);}catch(Exception e){} }});
    gc.setDaemon(true); gc.start();
    long r=jitSpill(a, 30_000_000); done=true;
    long p=pSpill(a, 30_000_000); long expect=42L*30_000_000;
    System.out.println("local="+jitLocal(a)+" spill jit="+r+" plain="+p+" expect="+expect+" match="+(r==p&&r==expect)+(fail==0?"":" LOCALFAIL"));
  }
}
