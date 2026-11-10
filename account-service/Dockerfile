# Production image (Vercel builds it; see vercel.json at the repo root).
# Local development still uses `npm run dev`, not this file.
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
# pays the full Spring startup (~27 s on 1 vCPU, close to the point where
# Vercel gives up on the request). A training run records the classes Spring
# loads into an AOT cache, which cuts startup to ~11 s. It needs no database:
# Flyway and Hibernate's schema checks are switched off for that run only.
RUN DB_HOST=localhost DB_USER=training DB_PASSWORD=training \
    SUPABASE_URL=https://training.supabase.co SUPABASE_PUBLISHABLE_KEY=training SUPABASE_SECRET_KEY=training \
    java -XX:AOTCacheOutput=app.aot -XX:TieredStopAtLevel=1 -XX:+UseSerialGC \
      -Dspring.context.exit=onRefresh -jar app.jar \
      --spring.flyway.enabled=false \
      --spring.jpa.hibernate.ddl-auto=none \
      --spring.jpa.database-platform=org.hibernate.dialect.PostgreSQLDialect \
      --spring.jpa.properties.hibernate.boot.allow_jdbc_metadata_access=false
# Vercel routes traffic to $PORT (80 unless the project sets PORT).
# The C1-only JIT and serial GC trim startup CPU, which Vercel meters.
CMD ["sh", "-c", "exec java -XX:AOTCache=app.aot -XX:TieredStopAtLevel=1 -XX:+UseSerialGC -jar app.jar --server.port=${PORT:-80}"]
