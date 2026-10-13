package com.makanmatch.context_service.client;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class CatalogServiceClientTest {
    @Test
    void mapsVenueSearchAndNormalizedCoordinates() {
        RestClient.Builder builder = RestClient.builder().baseUrl("http://catalog.test");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(method(HttpMethod.GET))
                .andExpect(requestTo("http://catalog.test/api/catalog/venues?q=Newton&limit=200"))
                .andRespond(withSuccess("""
                        [{"id":"ov-1","name":"Newton","lat":1.3115,"lon":103.8392,"category":"hawker"}]
                        """, MediaType.APPLICATION_JSON));

        CatalogServiceClient client = new CatalogServiceClient(builder.build());
        var venues = client.searchVenues("Newton", 200);

        assertThat(venues).singleElement().satisfies(v -> {
            assertThat(v.id()).isEqualTo("ov-1");
            assertThat(v.lat()).isEqualTo(1.3115);
            assertThat(v.lon()).isEqualTo(103.8392);
        });
        server.verify();
    }

    @Test
    void mapsDishPricesForOneVenue() {
        RestClient.Builder builder = RestClient.builder().baseUrl("http://catalog.test");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(method(HttpMethod.GET))
                .andExpect(requestTo("http://catalog.test/api/catalog/venues/v-1/dishes"))
                .andRespond(withSuccess("""
                        [{"id":"d-1","venueId":"v-1","name":"Noodles","source":"OWNER",
                          "archived":false,"price":7.50,"officialPrice":7.50,"communityPrice":7.00,
                          "priceConflict":false}]
                        """, MediaType.APPLICATION_JSON));

        var dishes = new CatalogServiceClient(builder.build()).getDishes("v-1");

        assertThat(dishes).singleElement().satisfies(d -> {
            assertThat(d.venueId()).isEqualTo("v-1");
            assertThat(d.price()).isEqualByComparingTo("7.50");
            assertThat(d.source()).isEqualTo("OWNER");
        });
        server.verify();
    }
}
