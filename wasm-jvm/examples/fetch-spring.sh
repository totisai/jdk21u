#!/usr/bin/env bash
# Fetch the Spring + micrometer jars used by the "Spring context" template from
# Maven Central into ./springlib. Run from build/<conf>/web/ (or pass a dir).
set -euo pipefail
OUT="${1:-springlib}"; mkdir -p "$OUT"
SV=6.1.14; MV=1.12.13; BASE=https://repo1.maven.org/maven2
jars=(
  "org/springframework/spring-core/$SV/spring-core-$SV.jar"
  "org/springframework/spring-beans/$SV/spring-beans-$SV.jar"
  "org/springframework/spring-context/$SV/spring-context-$SV.jar"
  "org/springframework/spring-aop/$SV/spring-aop-$SV.jar"
  "org/springframework/spring-expression/$SV/spring-expression-$SV.jar"
  "org/springframework/spring-jcl/$SV/spring-jcl-$SV.jar"
  "io/micrometer/micrometer-observation/$MV/micrometer-observation-$MV.jar"
  "io/micrometer/micrometer-commons/$MV/micrometer-commons-$MV.jar"
)
for j in "${jars[@]}"; do
  curl -sL -o "$OUT/$(basename "$j")" "$BASE/$j" && echo "got $(basename "$j")"
done
echo "done -> $OUT"
