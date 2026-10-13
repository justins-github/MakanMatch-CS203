package com.makanmatch.context_service.controller;

import com.makanmatch.context_service.service.VenueCacheService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class CatalogCacheHealthController {
    private final VenueCacheService cache;
    public CatalogCacheHealthController(VenueCacheService cache) { this.cache = cache; }

    @GetMapping("/debug/catalog-cache")
    public VenueCacheService.CacheStatus catalogCache() { return cache.status(); }
}
