public class C2c {
  static class Box { int v; }
  static int jitGet(Object o){ return ((Box)o).v; }        // checkcast Box + getfield
  static int jitLen(Object o){ return ((int[])o).length; }  // checkcast [I + arraylength
  static int pGet(Object o){ return ((Box)o).v; }
  static int pLen(Object o){ return ((int[])o).length; }
  static int fail=0;
  static String exc(java.util.function.Supplier<Integer> f){ try{ f.get(); return "ok"; }catch(Throwable t){ return t.getClass().getSimpleName(); } }
  public static void main(String[] x){
    Box b=new Box(); b.v=99; int[] ia={1,2,3,4};
    for(int k=0;k<40;k++){
      if(jitGet(b)!=pGet(b)){System.out.println("FAIL get");fail++;}
      if(jitLen(ia)!=pLen(ia)){System.out.println("FAIL len");fail++;}
    }
    // exceptions must match the interpreter
    if(!exc(()->jitGet("x")).equals(exc(()->pGet("x")))){System.out.println("FAIL cce");fail++;}
    if(!exc(()->jitGet(null)).equals(exc(()->pGet(null)))){System.out.println("FAIL npe");fail++;}
    if(!exc(()->jitLen("x")).equals(exc(()->pLen("x")))){System.out.println("FAIL cce2");fail++;}
    System.out.println("get="+jitGet(b)+" len="+jitLen(ia)+" cce="+exc(()->jitGet("x"))+" npe="+exc(()->jitGet(null)));
    System.out.println(fail==0?"ALL PASS":("FAIL="+fail));
  }
}
