package com.makanmatch.account_service.kaki.dto;

import java.time.Instant;
import java.util.UUID;

/**
 * A kaki, or someone in a request.
 *
 * @param since when they became kakis; for a request, when it was made
 */
public record Kaki(UUID id, String displayName, String username, Instant since) {
}
