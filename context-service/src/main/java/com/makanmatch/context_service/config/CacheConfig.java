package com.makanmatch.context_service.config;

import com.github.benmanes.caffeine.cache.Caffeine;
import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.cache.caffeine.CaffeineCache;
import org.springframework.cache.support.SimpleCacheManager;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Duration;
import java.util.List;

@Configuration
@EnableCaching
public class CacheConfig {
    @Bean
    CacheManager cacheManager() {
        SimpleCacheManager manager = new SimpleCacheManager();
        manager.setCaches(List.of(
                new CaffeineCache("walkRoutes", Caffeine.newBuilder()
                        .expireAfterWrite(Duration.ofMinutes(10)).build()),
                new CaffeineCache("weather", Caffeine.newBuilder()
                        .expireAfterWrite(Duration.ofMinutes(5)).build()),
                new CaffeineCache("catalogVenueStatuses", Caffeine.newBuilder()
                        .expireAfterWrite(Duration.ofMinutes(5)).build()),
                new CaffeineCache("catalogVenueHours", Caffeine.newBuilder()
                        .expireAfterWrite(Duration.ofMinutes(5)).build()),
                new CaffeineCache("catalogPrices", Caffeine.newBuilder()
                        .expireAfterWrite(Duration.ofMinutes(10)).build())
        ));
        return manager;
    }
}
