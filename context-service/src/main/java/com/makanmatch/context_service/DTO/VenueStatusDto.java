package com.makanmatch.context_service.DTO;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.time.Instant;

@JsonIgnoreProperties(ignoreUnknown = true)
public record VenueStatusDto(String venueId, String status, String currentAddress, String openingHours,
                             String note, Instant reportedAt) {}
