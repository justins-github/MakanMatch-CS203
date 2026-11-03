package com.makanmatch.account_service.claim;

import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.makanmatch.account_service.claim.dto.ClaimResponse;
import com.makanmatch.account_service.claim.dto.CreateClaimRequest;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/claims")
@Tag(name = "Claims", description = "Ask to manage a venue; an admin approves or rejects")
@SecurityRequirement(name = "bearer")
public class ClaimController {

	private final ClaimService claims;

	public ClaimController(ClaimService claims) {
		this.claims = claims;
	}

	@PostMapping
	@ResponseStatus(HttpStatus.CREATED)
	@Operation(summary = "Claim a venue (proof is required and shown to the admin)")
	public ClaimResponse create(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody CreateClaimRequest body) {
		return claims.create(userId(jwt), body);
	}

	@GetMapping("/mine")
	@Operation(summary = "My claims, newest first")
	public List<ClaimResponse> mine(@AuthenticationPrincipal Jwt jwt) {
		return claims.mine(userId(jwt));
	}

	@PostMapping("/{id}/withdraw")
	@Operation(summary = "Withdraw one of my pending claims")
	public ClaimResponse withdraw(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
		return claims.withdraw(userId(jwt), id);
	}

	private static UUID userId(Jwt jwt) {
		return UUID.fromString(jwt.getSubject());
	}
}
