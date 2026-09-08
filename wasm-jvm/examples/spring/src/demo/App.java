package demo;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.web.bind.annotation.*;
import java.util.*;

@SpringBootApplication
@RestController
public class App {
  @GetMapping("/api/hello")
  public Map<String,Object> hello() {
    return Map.of("message", "hello from Spring Boot inside the JVM",
                  "framework", "spring-boot", "thread", Thread.currentThread().getName());
  }
  @PostMapping("/api/echo")
  public Map<String,Object> echo(@RequestBody Map<String,Object> body) {
    return Map.of("youSent", body);
  }
  public static void main(String[] args) throws Exception {
    SpringApplication.run(App.class, args);
    System.out.println("SPRING READY");
    Object lock = new Object();
    synchronized (lock) { lock.wait(); }
  }
}
