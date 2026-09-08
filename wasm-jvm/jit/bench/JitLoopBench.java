public class JitLoopBench {
    static int jitWork(int n) {
        int s = 0;
        for (int i = 0; i < n; i++) {
            s = s * 31 + i;
            s = s ^ (s >>> 7);
            s = s + (i & 15);
        }
        return s;
    }
    static int plainWork(int n) {
        int s = 0;
        for (int i = 0; i < n; i++) {
            s = s * 31 + i;
            s = s ^ (s >>> 7);
            s = s + (i & 15);
        }
        return s;
    }
    public static void main(String[] args) {
        int n = Integer.parseInt(args.length>0?args[0]:"40000000");
        jitWork(1000); plainWork(1000);       // warmup (triggers JIT compile of jitWork)
        long t0=System.nanoTime(); int sj=jitWork(n); long t1=System.nanoTime();
        int sp=plainWork(n); long t2=System.nanoTime();
        long jitMs=(t1-t0)/1000000, intMs=(t2-t1)/1000000;
        System.out.println("n="+n+" checksum jit="+sj+" plain="+sp+" match="+(sj==sp));
        System.out.println("JIT (wasm)   : "+jitMs+" ms");
        System.out.println("interpreter  : "+intMs+" ms");
        System.out.printf("speedup      : %.1fx%n", (double)intMs/Math.max(1,jitMs));
    }
}
