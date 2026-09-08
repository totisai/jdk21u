package net.java.games.input;
/* Minimal jinput stub: LWJGL's Controllers.create() only needs Controller + its
 * Type; no real controllers are ever enumerated on wasm. */
public interface Controller {
    Type getType();
    class Type {
        public static final Type KEYBOARD = new Type();
        public static final Type MOUSE    = new Type();
    }
}
