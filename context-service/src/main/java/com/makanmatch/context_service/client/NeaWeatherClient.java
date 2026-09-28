package com.makanmatch.context_service.client;

import com.makanmatch.context_service.config.NeaProperties;
import com.makanmatch.context_service.exception.NeaException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

@Component
public class NeaWeatherClient {
    private static final Logger log = LoggerFactory.getLogger(NeaWeatherClient.class);
    private static final String FORECAST_PATH = "/two-hr-forecast";

    private final RestClient restClient;
    private final NeaProperties properties;

    public NeaWeatherClient(@Qualifier("neaRestClient") RestClient restClient, NeaProperties properties) {
        this.restClient = restClient;
        this.properties = properties;
    }

    public NeaForecastResponse.Data getLatestForecast() {
        log.info("Fetching NEA two-hour forecast");
        try {
            RestClient.RequestHeadersSpec<?> request = restClient.get().uri(FORECAST_PATH);
            if (properties.apiKey() != null && !properties.apiKey().isBlank()) {
                request.header("x-api-key", properties.apiKey());
            }
            NeaForecastResponse response = request.retrieve().body(NeaForecastResponse.class);
            if (response == null || response.code() != 0 || response.data() == null) {
                throw new NeaException("NEA two-hour forecast returned an invalid response");
            }
            return response.data();
        } catch (RestClientException e) {
            throw new NeaException("NEA two-hour forecast request failed", e);
        }
    }
}
