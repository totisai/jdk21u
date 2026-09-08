#!/usr/bin/env bash
# Fetch a minimal Spring Boot 3.2 web (embedded Tomcat) dependency set from Maven
# Central into ./springboot-lib. These are staged onto the wasm JVM's /app classpath.
set -euo pipefail
OUT="${1:-springboot-lib}"; mkdir -p "$OUT"
BASE=https://repo1.maven.org/maven2
BV=3.2.12       # spring-boot
SV=6.1.14       # spring-framework
TV=10.1.34      # tomcat-embed
JV=2.15.4       # jackson
MV=1.12.13      # micrometer
jars=(
  "org/springframework/boot/spring-boot/$BV/spring-boot-$BV.jar"
  "org/springframework/boot/spring-boot-autoconfigure/$BV/spring-boot-autoconfigure-$BV.jar"
  "org/springframework/spring-core/$SV/spring-core-$SV.jar"
  "org/springframework/spring-beans/$SV/spring-beans-$SV.jar"
  "org/springframework/spring-context/$SV/spring-context-$SV.jar"
  "org/springframework/spring-aop/$SV/spring-aop-$SV.jar"
  "org/springframework/spring-expression/$SV/spring-expression-$SV.jar"
  "org/springframework/spring-jcl/$SV/spring-jcl-$SV.jar"
  "org/springframework/spring-web/$SV/spring-web-$SV.jar"
  "org/springframework/spring-webmvc/$SV/spring-webmvc-$SV.jar"
  "org/apache/tomcat/embed/tomcat-embed-core/$TV/tomcat-embed-core-$TV.jar"
  "org/apache/tomcat/embed/tomcat-embed-el/$TV/tomcat-embed-el-$TV.jar"
  "com/fasterxml/jackson/core/jackson-databind/$JV/jackson-databind-$JV.jar"
  "com/fasterxml/jackson/core/jackson-core/$JV/jackson-core-$JV.jar"
  "com/fasterxml/jackson/core/jackson-annotations/$JV/jackson-annotations-$JV.jar"
  "io/micrometer/micrometer-observation/$MV/micrometer-observation-$MV.jar"
  "io/micrometer/micrometer-commons/$MV/micrometer-commons-$MV.jar"
  "jakarta/annotation/jakarta.annotation-api/2.1.1/jakarta.annotation-api-2.1.1.jar"
  "org/slf4j/slf4j-api/2.0.13/slf4j-api-2.0.13.jar"
  "org/yaml/snakeyaml/2.2/snakeyaml-2.2.jar"
)
for j in "${jars[@]}"; do
  curl -sL -o "$OUT/$(basename "$j")" "$BASE/$j" && echo "got $(basename "$j")"
done
echo "done -> $OUT ($(ls "$OUT" | wc -l | tr -d ' ') jars, $(du -sh "$OUT" | cut -f1))"
