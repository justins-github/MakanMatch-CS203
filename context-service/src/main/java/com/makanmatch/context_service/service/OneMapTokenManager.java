package com.makanmatch.context_service.service;

import com.makanmatch.context_service.DTO.TokenResponse;
import com.makanmatch.context_service.config.OneMapProperties;
import com.makanmatch.context_service.exception.OneMapException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;

@Component
public class OneMapTokenManager {

    private static final Logger log = LoggerFactory.getLogger(OneMapTokenManager.class);
    private static final Duration EXPIRY_SAFETY_MARGIN = Duration.ofMinutes(5);

    private final RestClient restClient;
    private final OneMapProperties props;
    private volatile String cachedToken;
    private volatile Instant expiresAt = Instant.MIN;

    public OneMapTokenManager(@Qualifier("oneMapRestClient") RestClient restClient, OneMapProperties props) {
        this.restClient = restClient;
        this.props = props;
    }

    public synchronized String getValidToken() {
        if (cachedToken != null && Instant.now().isBefore(expiresAt.minus(EXPIRY_SAFETY_MARGIN))) {
            return cachedToken;
        }
        return refreshToken();
    }

    public synchronized void invalidateToken() {
        cachedToken = null;
        expiresAt = Instant.MIN;
    }

    private String refreshToken() {
        log.info("Fetching OneMap access token");
        try {
            TokenResponse response = restClient.post()
                    .uri("/api/auth/post/getToken")
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of("email", props.email(), "password", props.password()))
                    .retrieve()
                    .body(TokenResponse.class);

            if (response == null || response.accessToken() == null || response.accessToken().isBlank()) {
                throw new OneMapException("OneMap token response missing access_token");
            }

            cachedToken = response.accessToken();
            expiresAt = Instant.ofEpochSecond(Long.parseLong(response.expiryTimestamp()));
            log.debug("OneMap token cached until {}", expiresAt);
            return cachedToken;
        } catch (RestClientException e) {
            throw new OneMapException("OneMap token fetch failed", e);
        } catch (NumberFormatException e) {
            throw new OneMapException("OneMap token response has invalid expiry_timestamp", e);
        }
    }
}
