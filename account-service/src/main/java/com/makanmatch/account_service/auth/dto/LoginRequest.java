package com.makanmatch.account_service.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** @param identifier an email address, or a username the account has set */
public record LoginRequest(
		@NotBlank @Size(max = 254) String identifier,
		@NotBlank @Size(max = 72) String password) {
}
