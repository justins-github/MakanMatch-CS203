package com.makanmatch.account_service.profile.dto;

import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Partial update: a null field is left unchanged. An empty username removes it.
 */
public record UpdateProfileRequest(
		@Size(min = 1, max = 40, message = "must be 1-40 characters") String displayName,
		@Pattern(regexp = "^$|^[A-Za-z][A-Za-z0-9_]{2,19}$",
				message = "must be 3-20 letters, digits or underscores, starting with a letter") String username) {
}
