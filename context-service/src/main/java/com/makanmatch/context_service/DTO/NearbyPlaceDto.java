package com.makanmatch.context_service.DTO;

import java.math.BigDecimal;
import io.swagger.v3.oas.annotations.media.Schema;

public record NearbyPlaceDto(String id, String name, double lat, double lng,
                             double rawWalkMinutes, double adjustedWalkMinutes,
                             double weatherScore, java.util.List<String> reasons,
                             @Schema(description = "Median current dish price; null when unavailable") BigDecimal medianPrice,
                             @Schema(description = "Price band: $, $$, $$$; null when unavailable") String priceBand,
                             @Schema(description = "OWNER_VERIFIED, CROWD_ESTIMATED, SEED_ONLY, or UNKNOWN") PriceSource priceSource,
                             @Schema(description = "Number of priced dishes used") int priceReportCount) {
    public NearbyPlaceDto(String id, String name, double lat, double lng,
                          double rawWalkMinutes, double adjustedWalkMinutes) {
        this(id, name, lat, lng, rawWalkMinutes, adjustedWalkMinutes, 0.0, java.util.List.of());
    }

    public NearbyPlaceDto(String id, String name, double lat, double lng,
                          double rawWalkMinutes, double adjustedWalkMinutes,
                          double weatherScore, java.util.List<String> reasons) {
        this(id, name, lat, lng, rawWalkMinutes, adjustedWalkMinutes, weatherScore, reasons,
                null, null, PriceSource.UNKNOWN, 0);
    }

    public NearbyPlaceDto {
        reasons = reasons == null ? java.util.List.of() : java.util.List.copyOf(reasons);
    }
}
