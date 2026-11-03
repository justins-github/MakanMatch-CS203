package com.makanmatch.catalog_service.contributions;

import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;

@RestController
@RequestMapping("/api/catalog/me")
@Tag(name = "Contributions", description = "What the signed-in account added to the catalog")
@SecurityRequirement(name = "bearer")
public class ContributionsController {

	private final ContributionsService contributions;

	public ContributionsController(ContributionsService contributions) {
		this.contributions = contributions;
	}

	/** Step 2 of deleting an account (engine first, account-service last). */
	@DeleteMapping("/contributions")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	@Operation(summary = "Before deleting your account: keep what you added, but stop saying it was you")
	public void forget(@AuthenticationPrincipal Jwt jwt) {
		contributions.forget(UUID.fromString(jwt.getSubject()));
	}
}
