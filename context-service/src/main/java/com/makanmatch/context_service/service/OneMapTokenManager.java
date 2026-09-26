package com.makanmatch.context_service.service;

import com.makanmatch.context_service.DTO.TokenResponse;
import com.makanmatch.context_service.config.OneMapProperties;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;

@Component
public class OneMapTokenManager {
    private final RestClient restClient;
    private final OneMapProperties props;
    private volatile String cachedToken;
    private volatile Instant expiresAt = Instant.MIN;

    public OneMapTokenManager(RestClient restClient, OneMapProperties props) {
        this.restClient = restClient;
        this.props = props;
    }

    public synchronized String getValidToken() {
        if (cachedToken != null && Instant.now().isBefore(expiresAt.minus(Duration.ofMinutes(5)))) {
            return cachedToken; // still valid, 5-min safety margin before real expiry
        }
        TokenResponse response = restClient.post()
                .uri("/api/auth/post/getToken")
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("email", props.email(), "password", props.password()))
                .retrieve()
                .body(TokenResponse.class);

        this.cachedToken = response.accessToken();
        this.expiresAt = Instant.ofEpochSecond(Long.parseLong(response.expiryTimestamp()));
        return cachedToken;
    }
}
