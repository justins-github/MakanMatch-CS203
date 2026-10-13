package com.makanmatch.context_service.DTO;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.time.Instant;
import java.util.List;

@JsonIgnoreProperties(ignoreUnknown = true)
public record OpeningHoursDto(String venueId, List<DayHours> week, Instant updatedAt) {
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record DayHours(String day, List<TimeRange> sessions) {}
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record TimeRange(String opens, String closes) {}
}
