package com.makanmatch.context_service.controller;

import com.makanmatch.context_service.DTO.NearbyResponse;
import com.makanmatch.context_service.service.PlaceQueryService;
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
@RequestMapping("/api/places")
public class PlacesController {
    private static final double MIN_LAT = 1.13;
    private static final double MAX_LAT = 1.47;
    private static final double MIN_LNG = 103.59;
    private static final double MAX_LNG = 104.10;

    private final PlaceQueryService placeQueryService;

    public PlacesController(PlaceQueryService placeQueryService) {
        this.placeQueryService = placeQueryService;
    }

    @Operation(
            summary = "Find nearby places by walking time",
            description = "Returns fixture places whose rain-adjusted OneMap walking time is within maxWalkMin. "
                    + "Only the nearest places.max-routed candidates are routed; places beyond that limit "
                    + "are not checked and cannot appear in the response."
    )
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Nearby places, sorted by walking time",
                    content = @Content(schema = @Schema(implementation = NearbyResponse.class))),
            @ApiResponse(responseCode = "400", description = "Invalid coordinates or maxWalkMin")
    })
    @GetMapping("/nearby")
    public NearbyResponse nearby(
            @Parameter(description = "Latitude in the Singapore bounding box", example = "1.3521")
            @RequestParam String lat,
            @Parameter(description = "Longitude in the Singapore bounding box", example = "103.8198")
            @RequestParam String lng,
            @Parameter(description = "Maximum walking time in minutes (1–60)", example = "20")
            @RequestParam String maxWalkMin) {
        double latitude = parseDouble(lat, "lat");
        double longitude = parseDouble(lng, "lng");
        int walkingMinutes = parseInteger(maxWalkMin, "maxWalkMin");

        if (latitude < MIN_LAT || latitude > MAX_LAT) {
            throw badRequest("lat must be within Singapore bounds (1.13 to 1.47)");
        }
        if (longitude < MIN_LNG || longitude > MAX_LNG) {
            throw badRequest("lng must be within Singapore bounds (103.59 to 104.10)");
        }
        if (walkingMinutes < 1 || walkingMinutes > 60) {
            throw badRequest("maxWalkMin must be between 1 and 60");
        }
        return placeQueryService.findNearby(latitude, longitude, walkingMinutes);
    }

    private static double parseDouble(String value, String parameterName) {
        try {
            double parsed = Double.parseDouble(value);
            if (!Double.isFinite(parsed)) {
                throw badRequest(parameterName + " must be a finite number");
            }
            return parsed;
        } catch (NumberFormatException e) {
            throw badRequest(parameterName + " must be a number");
        }
    }

    private static int parseInteger(String value, String parameterName) {
        try {
            return Integer.parseInt(value);
        } catch (NumberFormatException e) {
            throw badRequest(parameterName + " must be an integer");
        }
    }

    private static ResponseStatusException badRequest(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }
}
