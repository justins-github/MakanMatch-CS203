package com.makanmatch.context_service.service;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.makanmatch.context_service.client.NeaForecastResponse;
import com.makanmatch.context_service.client.NeaWeatherClient;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.cache.CacheManager;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@SpringBootTest
class WeatherCachingIntegrationTest {
    private static final Logger LOGGER = (Logger) LoggerFactory.getLogger(WeatherService.class);

    @Autowired
    WeatherService weatherService;

    @Autowired
    CacheManager cacheManager;

    @MockitoBean
    NeaWeatherClient neaWeatherClient;

    private ListAppender<ILoggingEvent> appender;
    private Level previousLevel;

    @BeforeEach
    void setUp() {
        cacheManager.getCache("weather").clear();
        previousLevel = LOGGER.getLevel();
        LOGGER.setLevel(Level.INFO);
        appender = new ListAppender<>();
        appender.start();
        LOGGER.addAppender(appender);
        when(neaWeatherClient.getLatestForecast()).thenReturn(new NeaForecastResponse.Data(
                List.of(new NeaForecastResponse.AreaMetadata("City",
                        new NeaForecastResponse.LabelLocation(1.292, 103.844))),
                List.of(new NeaForecastResponse.ForecastItem(
                        List.of(new NeaForecastResponse.Forecast("City", "Cloudy"))))));
    }

    @AfterEach
    void tearDown() {
        LOGGER.detachAppender(appender);
        LOGGER.setLevel(previousLevel);
    }

    @Test
    void secondCallWithinCacheWindowDoesNotLogAnotherForecastLoadOrHitClient() {
        weatherService.getContext(1.292, 103.844);
        weatherService.getContext(1.292, 103.844);

        long loadLogs = appender.list.stream()
                .filter(event -> event.getFormattedMessage().contains("Loading NEA weather context"))
                .count();
        assertThat(loadLogs).isEqualTo(1);
        verify(neaWeatherClient, times(1)).getLatestForecast();
    }
}
