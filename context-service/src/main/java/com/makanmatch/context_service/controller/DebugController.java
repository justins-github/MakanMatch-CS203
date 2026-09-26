package com.makanmatch.context_service.controller;

import com.makanmatch.context_service.DTO.WalkRouteDto;
import com.makanmatch.context_service.service.OneMapClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class DebugController {
    private final OneMapClient client;
    DebugController(OneMapClient client) { this.client = client; }

    @GetMapping("/debug/walk")
    WalkRouteDto debugWalk() {
        return client.getWalkRoute(1.3521, 103.8198, 1.2966, 103.8520); // Novena, Raffles Place
    }
}