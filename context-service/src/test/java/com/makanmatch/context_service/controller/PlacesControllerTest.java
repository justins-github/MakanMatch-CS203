package com.makanmatch.context_service.controller;

import com.makanmatch.context_service.service.OneMapClient;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.Mockito.verifyNoInteractions;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class PlacesControllerTest {
    @Autowired
    MockMvc mockMvc;

    @MockitoBean
    OneMapClient oneMapClient;

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
                .andExpect(content().string(org.hamcrest.Matchers.containsString("/api/places/nearby")));
        mockMvc.perform(get("/swagger-ui/index.html"))
                .andExpect(status().isOk());
    }
}
