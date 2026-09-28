package com.makanmatch.context_service.controller;

import com.makanmatch.context_service.DTO.WeatherContext;
import com.makanmatch.context_service.service.WeatherService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/context")
public class ContextController {
    private final WeatherService weatherService;

    public ContextController(WeatherService weatherService) {
        this.weatherService = weatherService;
    }

    @Operation(summary = "Get the nearest area's current two-hour forecast context")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Weather context; NEA failures return unavailable status",
                    content = @Content(schema = @Schema(implementation = WeatherContext.class))),
            @ApiResponse(responseCode = "400", description = "Invalid latitude or longitude")
    })
    @GetMapping("/weather")
    public WeatherContext weather(
            @Parameter(description = "Singapore latitude", example = "1.3521") @RequestParam String lat,
            @Parameter(description = "Singapore longitude", example = "103.8198") @RequestParam String lng) {
        double latitude = parseCoordinate(lat, "lat");
        double longitude = parseCoordinate(lng, "lng");
        if (latitude < 1.13 || latitude > 1.47) {
            throw badRequest("lat must be within Singapore bounds (1.13 to 1.47)");
        }
        if (longitude < 103.59 || longitude > 104.10) {
            throw badRequest("lng must be within Singapore bounds (103.59 to 104.10)");
        }
        return weatherService.getContext(latitude, longitude);
    }

    private static double parseCoordinate(String value, String name) {
        try {
            double coordinate = Double.parseDouble(value);
            if (!Double.isFinite(coordinate)) {
                throw badRequest(name + " must be a finite number");
            }
            return coordinate;
        } catch (NumberFormatException e) {
            throw badRequest(name + " must be a number");
        }
    }

    private static ResponseStatusException badRequest(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }
}
