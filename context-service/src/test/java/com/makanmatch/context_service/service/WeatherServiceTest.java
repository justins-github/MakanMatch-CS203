package com.makanmatch.context_service.service;

import com.makanmatch.context_service.DTO.RainCategory;
import com.makanmatch.context_service.DTO.WeatherContext;
import com.makanmatch.context_service.client.NeaForecastResponse;
import com.makanmatch.context_service.client.NeaWeatherClient;
import com.makanmatch.context_service.config.WeatherProperties;
import com.makanmatch.context_service.exception.NeaException;
import org.junit.jupiter.api.Test;
import org.springframework.cache.concurrent.ConcurrentMapCacheManager;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class WeatherServiceTest {
    @Test
    void classifiesCommonForecastTexts() {
        assertThat(RainCategory.classify("Cloudy")).isEqualTo(RainCategory.NONE);
        assertThat(RainCategory.classify("Partly Cloudy"))
                .isEqualTo(RainCategory.NONE);
        assertThat(RainCategory.classify("Light Rain")).isEqualTo(RainCategory.LIGHT);
        assertThat(RainCategory.classify("Moderate Rain")).isEqualTo(RainCategory.LIGHT);
        assertThat(RainCategory.classify("Passing Showers")).isEqualTo(RainCategory.LIGHT);
        assertThat(RainCategory.classify("Thundery Showers")).isEqualTo(RainCategory.HEAVY);
        assertThat(RainCategory.classify("Heavy Thundery Showers")).isEqualTo(RainCategory.HEAVY);
    }

    @Test
    void selectsForecastForNearestArea() {
        NeaWeatherClient client = mock(NeaWeatherClient.class);
        NeaForecastResponse.Data data = new NeaForecastResponse.Data(
                List.of(
                        new NeaForecastResponse.AreaMetadata("City",
                                new NeaForecastResponse.LabelLocation(1.292, 103.844)),
                        new NeaForecastResponse.AreaMetadata("Bishan",
                                new NeaForecastResponse.LabelLocation(1.350772, 103.839))
                ),
                List.of(new NeaForecastResponse.ForecastItem(List.of(
                        new NeaForecastResponse.Forecast("City", "Cloudy"),
                        new NeaForecastResponse.Forecast("Bishan", "Light Rain")
                )))
        );
        when(client.getLatestForecast()).thenReturn(data);

        WeatherContext context = service(client).getContext(1.349, 103.839);

        assertThat(context.area()).isEqualTo("Bishan");
        assertThat(context.forecastText()).isEqualTo("Light Rain");
        assertThat(context.rainCategory()).isEqualTo(RainCategory.LIGHT);
        assertThat(context.multiplier()).isEqualTo(1.25);
        assertThat(context.status()).isEqualTo("available");
    }

    @Test
    void clientFailureReturnsNeutralUnavailableContext() {
        NeaWeatherClient client = mock(NeaWeatherClient.class);
        when(client.getLatestForecast()).thenThrow(new NeaException("simulated NEA failure"));

        WeatherContext context = service(client).getContext(1.3, 103.8);

        assertThat(context.rainCategory()).isEqualTo(RainCategory.NONE);
        assertThat(context.multiplier()).isEqualTo(1.0);
        assertThat(context.status()).isEqualTo("unavailable");
    }

    private static WeatherService service(NeaWeatherClient client) {
        return new WeatherService(client, new WeatherProperties(new WeatherProperties.RainMultiplier(1.25, 1.4)),
                new ConcurrentMapCacheManager("weather"));
    }
}
