package com.makanmatch.context_service.client;

import com.makanmatch.context_service.config.NeaProperties;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class NeaWeatherClientTest {
    @Test
    void mapsTheLiveForecastResponseShapeAndAddsConfiguredApiKey() {
        RestClient.Builder builder = RestClient.builder().baseUrl("https://api-open.data.gov.sg/v2/real-time/api");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(method(HttpMethod.GET))
                .andExpect(requestTo("https://api-open.data.gov.sg/v2/real-time/api/two-hr-forecast"))
                .andExpect(header("x-api-key", "test-key"))
                .andRespond(withSuccess("""
                        {
                          "code": 0,
                          "data": {
                            "area_metadata": [
                              {"name":"City","label_location":{"latitude":1.292,"longitude":103.844}}
                            ],
                            "items": [
                              {"timestamp":"2026-09-28T10:00:00+08:00","forecasts":[{"area":"City","forecast":"Cloudy"}]}
                            ]
                          },
                          "errorMsg": null
                        }
                        """, MediaType.APPLICATION_JSON));
        NeaWeatherClient client = new NeaWeatherClient(builder.build(),
                new NeaProperties("https://api-open.data.gov.sg/v2/real-time/api", "test-key"));

        NeaForecastResponse.Data data = client.getLatestForecast();

        assertThat(data.areaMetadata()).hasSize(1);
        assertThat(data.areaMetadata().get(0).labelLocation().latitude()).isEqualTo(1.292);
        assertThat(data.items().get(0).forecasts().get(0).forecast()).isEqualTo("Cloudy");
        server.verify();
    }
}
