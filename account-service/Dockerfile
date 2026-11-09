# Production image (Vercel builds it; see vercel.json at the repo root).
# Local development still uses `npm run dev`, not this file.
FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /src
COPY pom.xml .
COPY src src
RUN mvn -q -B -DskipTests package && cp target/*.jar /app.jar

FROM eclipse-temurin:17-jre
COPY --from=build /app.jar /app.jar
# Vercel routes traffic to $PORT (80 unless the project sets PORT).
# The C1-only JIT and serial GC trim startup CPU, which the free plan meters.
CMD ["sh", "-c", "exec java -XX:TieredStopAtLevel=1 -XX:+UseSerialGC -jar /app.jar --server.port=${PORT:-80}"]
