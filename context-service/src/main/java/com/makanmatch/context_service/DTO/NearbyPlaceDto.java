package com.makanmatch.context_service.DTO;

public record NearbyPlaceDto(String id, String name, double lat, double lng,
                             double rawWalkMinutes, double adjustedWalkMinutes,
                             double weatherScore, java.util.List<String> reasons) {
    public NearbyPlaceDto(String id, String name, double lat, double lng,
                          double rawWalkMinutes, double adjustedWalkMinutes) {
        this(id, name, lat, lng, rawWalkMinutes, adjustedWalkMinutes, 0.0, java.util.List.of());
    }

    public NearbyPlaceDto {
        reasons = reasons == null ? java.util.List.of() : java.util.List.copyOf(reasons);
    }
}
