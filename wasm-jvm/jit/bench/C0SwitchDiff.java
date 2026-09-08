public class C0c {
  static int jitTable(int x){ switch(x){ case 0:return 100; case 1:return 200; case 2:return 300; case 3:return 400; default:return -1; } }
  static int jitLookup(int x){ switch(x){ case 5:return 50; case 50:return 500; case 500:return 5000; default:return -9; } }
  static int jitFall(int x){ int r=0; switch(x){ case 0:r=1;break; case 1:r=2;break; case 2:r=3;break; default:r=9; } return r*10; }
  static int pTable(int x){ switch(x){ case 0:return 100; case 1:return 200; case 2:return 300; case 3:return 400; default:return -1; } }
  static int pLookup(int x){ switch(x){ case 5:return 50; case 50:return 500; case 500:return 5000; default:return -9; } }
  static int pFall(int x){ int r=0; switch(x){ case 0:r=1;break; case 1:r=2;break; case 2:r=3;break; default:r=9; } return r*10; }
  static int fail=0;
  public static void main(String[] a){
    for(int k=0;k<40;k++){
      for(int v=-1;v<=6;v++) if(jitTable(v)!=pTable(v)){System.out.println("FAIL table@"+v);fail++;}
      for(int v : new int[]{5,50,500,3,999}) if(jitLookup(v)!=pLookup(v)){System.out.println("FAIL lookup@"+v);fail++;}
      for(int v=-1;v<=4;v++) if(jitFall(v)!=pFall(v)){System.out.println("FAIL fall@"+v);fail++;}
    }
    System.out.println("table(2)="+jitTable(2)+" lookup(50)="+jitLookup(50)+" fall(1)="+jitFall(1));
    System.out.println(fail==0?"ALL PASS":("FAIL="+fail));
  }
}
