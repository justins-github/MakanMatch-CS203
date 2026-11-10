# Production image (Vercel builds it; see vercel.json at the repo root).
# Locally, run it with ./mvnw spring-boot:run as the README describes.
FROM maven:3.9-eclipse-temurin-25 AS build
WORKDIR /src
COPY pom.xml .
COPY src src
RUN mvn -q -B -DskipTests package && cp target/*.jar /app.jar

FROM eclipse-temurin:25-jre
WORKDIR /app
COPY --from=build /app.jar /tmp/app.jar
RUN java -Djarmode=tools -jar /tmp/app.jar extract --destination /app && rm /tmp/app.jar
# Vercel stops idle instances after 5 minutes, so every visit after a break
# pays the full Spring startup. A training run records the classes Spring
# loads into an AOT cache, which cuts that startup roughly in half. This
# service has no database and calls nothing while starting, so the training
# run needs no settings.
RUN java -XX:AOTCacheOutput=app.aot -XX:TieredStopAtLevel=1 -XX:+UseSerialGC \
      -Dspring.context.exit=onRefresh -jar app.jar
# Vercel routes traffic to $PORT (80 unless the project sets PORT).
# The C1-only JIT and serial GC trim startup CPU, which Vercel meters.
CMD ["sh", "-c", "exec java -XX:AOTCache=app.aot -XX:TieredStopAtLevel=1 -XX:+UseSerialGC -jar app.jar --server.port=${PORT:-80}"]
