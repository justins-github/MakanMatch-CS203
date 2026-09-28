package com.makanmatch.context_service.client;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.List;

public record NeaForecastResponse(int code, Data data, String errorMsg) {
    public record Data(
            @JsonProperty("area_metadata") List<AreaMetadata> areaMetadata,
            List<ForecastItem> items
    ) {}

    public record AreaMetadata(String name, @JsonProperty("label_location") LabelLocation labelLocation) {}

    public record LabelLocation(double latitude, double longitude) {}

    public record ForecastItem(List<Forecast> forecasts) {}

    public record Forecast(String area, String forecast) {}
}
