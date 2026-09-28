package com.makanmatch.context_service.controller;

import com.makanmatch.context_service.service.OneMapClient;
import com.makanmatch.context_service.client.NeaWeatherClient;
import com.makanmatch.context_service.exception.NeaException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.cache.CacheManager;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class PlacesControllerTest {
    @Autowired
    MockMvc mockMvc;

    @Autowired
    CacheManager cacheManager;

    @MockitoBean
    OneMapClient oneMapClient;

    @MockitoBean
    NeaWeatherClient neaWeatherClient;

    @BeforeEach
    void clearWeatherCache() {
        cacheManager.getCache("weather").clear();
    }

    @Test
    void rejectsLatitudeOutsideSingaporeBoundsWithClearMessage() throws Exception {
        mockMvc.perform(get("/api/places/nearby")
                        .param("lat", "40")
                        .param("lng", "103.8")
                        .param("maxWalkMin", "10"))
                .andExpect(status().isBadRequest())
                .andExpect(content().string(org.hamcrest.Matchers.containsString("lat must be within Singapore bounds")));
        verifyNoInteractions(oneMapClient);
    }

    @Test
    void rejectsWalkTimeOutsideRangeWithClearMessage() throws Exception {
        mockMvc.perform(get("/api/places/nearby")
                        .param("lat", "1.3")
                        .param("lng", "103.8")
                        .param("maxWalkMin", "61"))
                .andExpect(status().isBadRequest())
                .andExpect(content().string(org.hamcrest.Matchers.containsString("maxWalkMin must be between 1 and 60")));
        verifyNoInteractions(oneMapClient);
    }

    @Test
    void publishesNearbyEndpointInSwaggerUiAndOpenApiDocument() throws Exception {
        mockMvc.perform(get("/v3/api-docs"))
                .andExpect(status().isOk())
                .andExpect(content().string(org.hamcrest.Matchers.containsString("/api/places/nearby")))
                .andExpect(content().string(org.hamcrest.Matchers.containsString("/api/context/weather")));
        mockMvc.perform(get("/swagger-ui/index.html"))
                .andExpect(status().isOk());
    }

    @Test
    void weatherEndpointReturnsUnavailableContextWhenNeaFails() throws Exception {
        when(neaWeatherClient.getLatestForecast()).thenThrow(new NeaException("NEA unavailable"));

        mockMvc.perform(get("/api/context/weather")
                        .param("lat", "1.3")
                        .param("lng", "103.8"))
                .andExpect(status().isOk())
                .andExpect(content().string(org.hamcrest.Matchers.containsString("\"status\":\"unavailable\"")))
                .andExpect(content().string(org.hamcrest.Matchers.containsString("\"multiplier\":1.0")));
    }
}
