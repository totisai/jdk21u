// C2.2 multianewarray (2D) differential. jitMk JIT-compiles `new int[m][n]` and
// returns the outer length; the differential + the ALL-JIT run (which also JITs
// pMk) confirm the multi_allocate helper builds the array correctly.
public class MArr {
  static int jitMk (int m, int n){ int[][] a = new int[m][n]; return a.length; }
  static int pMk   (int m, int n){ int[][] a = new int[m][n]; return a.length; }
  static long jitMkL(int m, int n){ long[][] a = new long[m][n]; return a.length; }   // typed variant
  static long pMkL  (int m, int n){ long[][] a = new long[m][n]; return a.length; }
  // interpreted 2D sanity (proves multi_allocate really allocates the inner rows)
  static int rowsum(int m, int n){ int[][] a = new int[m][n]; int s=0;
    for(int i=0;i<m;i++){ s += a[i].length; for(int j=0;j<n;j++) a[i][j]=1; for(int j=0;j<n;j++) s+=a[i][j]; } return s; }
  static int fail=0;
  public static void main(String[] x){
    for(int k=1;k<=8;k++){
      if(jitMk(k,3)!=pMk(k,3)){ System.out.println("FAIL Mk k="+k); fail++; }
      if(jitMkL(k,2)!=pMkL(k,2)){ System.out.println("FAIL MkL k="+k); fail++; }
    }
    // outer length must equal m; inner rows must each be length n (interpreted check)
    if(jitMk(5,7)!=5){ System.out.println("FAIL outer"); fail++; }
    if(rowsum(4,3)!=4*3 + 4*3){ System.out.println("FAIL rows="+rowsum(4,3)); fail++; }  // 4 rows*len3 + 12 ones
    System.out.println("Mk(5,7)="+jitMk(5,7)+" MkL(6,2)="+jitMkL(6,2)+" rowsum(4,3)="+rowsum(4,3));
    System.out.println(fail==0?"ALL PASS":("FAILURES="+fail));
  }
}
