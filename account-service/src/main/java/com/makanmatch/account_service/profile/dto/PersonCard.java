package com.makanmatch.account_service.profile.dto;

import java.util.UUID;

/**
 * What anyone signed in may know about another account, such as who wrote a review.
 * Email, dietary needs and owned venues stay private.
 *
 * @param username null until they pick one
 */
public record PersonCard(UUID id, String displayName, String username) {
}
