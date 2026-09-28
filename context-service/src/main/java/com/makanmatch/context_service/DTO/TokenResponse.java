package com.makanmatch.context_service.DTO;

import com.fasterxml.jackson.annotation.JsonProperty;

public record TokenResponse(
        @JsonProperty("access_token") String accessToken,
        @JsonProperty("expiry_timestamp") String expiryTimestamp
) {}