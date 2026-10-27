package com.makanmatch.account_service.auth.dto;

import com.makanmatch.account_service.profile.DietaryNeeds;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * 72 is bcrypt's input limit, which Supabase uses for password hashes.
 * {@code dietary} is optional; null means the form skipped it.
 */
public record SignupRequest(
		@NotBlank @Email @Size(max = 254) String email,
		@NotBlank
		@Size(min = 8, max = 72, message = "must be 8-72 characters")
		@Pattern(regexp = "^(?=.*[A-Za-z])(?=.*\\d).+$", message = "must contain a letter and a number")
		String password,
		@NotBlank @Size(max = 40, message = "must be at most 40 characters") String displayName,
		DietaryNeeds dietary) {
}
