// multianewarray 1..4 dims (was 2D-only). new T[a][b][c] etc.
public class MA {
  static int jit3(int a, int b, int c){ int[][][] x = new int[a][b][c]; x[a-1][b-1][c-1]=42; return x[a-1][b-1][c-1] + x.length + x[0].length + x[0][0].length; }
  static int p3  (int a, int b, int c){ int[][][] x = new int[a][b][c]; x[a-1][b-1][c-1]=42; return x[a-1][b-1][c-1] + x.length + x[0].length + x[0][0].length; }
  static int jit4(int a, int b, int c, int d){ long[][][][] x = new long[a][b][c][d]; return x.length*1000 + x[0].length*100 + x[0][0].length*10 + x[0][0][0].length; }
  static int p4  (int a, int b, int c, int d){ long[][][][] x = new long[a][b][c][d]; return x.length*1000 + x[0].length*100 + x[0][0].length*10 + x[0][0][0].length; }
  static int fail=0;
  public static void main(String[] s){
    for (int k=0;k<40;k++){
      if(jit3(2,3,4)!=p3(2,3,4)) fail++;
      if(jit4(2,3,4,5)!=p4(2,3,4,5)) fail++;
    }
    System.out.println("d3="+jit3(2,3,4)+" d4="+jit4(2,3,4,5)); // 42+2+3+4=51 ; 2345
    System.out.println(fail==0?"ALL PASS":"FAILURES="+fail);
  }
}
