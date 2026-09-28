package com.makanmatch.context_service.service;

import com.makanmatch.context_service.DTO.WalkRouteDto;
import com.makanmatch.context_service.config.CacheConfig;
import com.makanmatch.context_service.config.OneMapProperties;
import com.makanmatch.context_service.exception.OneMapException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.cache.CacheManager;
import org.springframework.context.annotation.Bean;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

@SpringBootTest(classes = {
        OneMapTokenManager.class,
        OneMapClient.class,
        CacheConfig.class,
        OneMapClientAuthRetryTest.MockRestClientConfig.class
})
@ActiveProfiles("test")
class OneMapClientAuthRetryTest {

    @Autowired
    MockRestServiceServer server;

    @Autowired
    OneMapClient oneMapClient;

    @Autowired
    OneMapTokenManager tokenManager;

    @Autowired
    CacheManager cacheManager;

    @BeforeEach
    void setUp() {
        server.reset();
        cacheManager.getCache("walkRoutes").clear();
        tokenManager.invalidateToken();
    }

    @Test
    void getWalkRoute_retriesOnceAfterUnauthorizedThenSucceeds() {
        server.expect(method(HttpMethod.POST))
                .andExpect(requestTo("https://www.onemap.gov.sg/api/auth/post/getToken"))
                .andRespond(withSuccess("""
                        {"access_token":"token-1","expiry_timestamp":"9999999999"}
                        """, MediaType.APPLICATION_JSON));

        server.expect(method(HttpMethod.GET))
                .andExpect(requestTo(containsString("/api/public/routingsvc/route")))
                .andExpect(header("Authorization", "token-1"))
                .andRespond(withStatus(HttpStatus.UNAUTHORIZED));

        server.expect(method(HttpMethod.POST))
                .andExpect(requestTo("https://www.onemap.gov.sg/api/auth/post/getToken"))
                .andRespond(withSuccess("""
                        {"access_token":"token-2","expiry_timestamp":"9999999999"}
                        """, MediaType.APPLICATION_JSON));

        server.expect(method(HttpMethod.GET))
                .andExpect(requestTo(containsString("/api/public/routingsvc/route")))
                .andExpect(header("Authorization", "token-2"))
                .andRespond(withSuccess("""
                        {
                          "route_geometry": "ignored",
                          "route_summary": {
                            "total_time": 120,
                            "total_distance": 300
                          }
                        }
                        """, MediaType.APPLICATION_JSON));

        WalkRouteDto route = oneMapClient.getWalkRoute(1.3521, 103.8198, 1.2966, 103.8520);

        assertThat(route.totalTimeSeconds()).isEqualTo(120L);
        assertThat(route.totalDistanceMetres()).isEqualTo(300L);
        server.verify();
    }

    @Test
    void getWalkRoute_doesNotRetryInfinitelyWhenUnauthorizedPersists() {
        server.expect(method(HttpMethod.POST))
                .andExpect(requestTo("https://www.onemap.gov.sg/api/auth/post/getToken"))
                .andRespond(withSuccess("""
                        {"access_token":"token-1","expiry_timestamp":"9999999999"}
                        """, MediaType.APPLICATION_JSON));

        server.expect(method(HttpMethod.GET))
                .andRespond(withStatus(HttpStatus.UNAUTHORIZED));

        server.expect(method(HttpMethod.POST))
                .andExpect(requestTo("https://www.onemap.gov.sg/api/auth/post/getToken"))
                .andRespond(withSuccess("""
                        {"access_token":"token-2","expiry_timestamp":"9999999999"}
                        """, MediaType.APPLICATION_JSON));

        server.expect(method(HttpMethod.GET))
                .andRespond(withStatus(HttpStatus.UNAUTHORIZED));

        assertThatThrownBy(() -> oneMapClient.getWalkRoute(1.3521, 103.8198, 1.2966, 103.8520))
                .isInstanceOf(OneMapException.class);

        server.verify();
    }

    @TestConfiguration
    @EnableConfigurationProperties(OneMapProperties.class)
    static class MockRestClientConfig {

        @Bean
        RestClient.Builder oneMapRestClientBuilder(OneMapProperties props) {
            return RestClient.builder().baseUrl(props.baseUrl());
        }

        @Bean
        MockRestServiceServer mockRestServiceServer(RestClient.Builder oneMapRestClientBuilder) {
            return MockRestServiceServer.bindTo(oneMapRestClientBuilder).build();
        }

        @Bean
        RestClient oneMapRestClient(RestClient.Builder oneMapRestClientBuilder, MockRestServiceServer server) {
            return oneMapRestClientBuilder.build();
        }
    }
}
