package com.makanmatch.account_service.claim;

import java.util.List;
import java.util.Locale;
import java.util.UUID;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.makanmatch.account_service.claim.dto.ClaimResponse;
import com.makanmatch.account_service.claim.dto.RejectClaimRequest;
import com.makanmatch.account_service.common.BadRequestException;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;

/** The admin side of claims; /api/admin/** needs the ADMIN role (see SecurityConfig). */
@RestController
@RequestMapping("/api/admin/claims")
@Tag(name = "Admin: claims", description = "Review venue ownership claims (needs the ADMIN role)")
@SecurityRequirement(name = "bearer")
public class ClaimReviewController {

	private final ClaimService claims;

	public ClaimReviewController(ClaimService claims) {
		this.claims = claims;
	}

	@GetMapping
	@Operation(summary = "List claims; PENDING by default (oldest first). Pass status=ALL for everything.")
	public List<ClaimResponse> list(@RequestParam(defaultValue = "PENDING") String status) {
		return claims.list(parseStatus(status));
	}

	@PostMapping("/{id}/approve")
	@Operation(summary = "Approve a claim; the claimant becomes an owner of that venue")
	public ClaimResponse approve(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
		return claims.approve(UUID.fromString(jwt.getSubject()), id);
	}

	@PostMapping("/{id}/reject")
	@Operation(summary = "Reject a claim with a reason the claimant will see")
	public ClaimResponse reject(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id,
			@Valid @RequestBody RejectClaimRequest body) {
		return claims.reject(UUID.fromString(jwt.getSubject()), id, body.reason());
	}

	/** null means "all statuses". */
	private static ClaimStatus parseStatus(String status) {
		if ("ALL".equalsIgnoreCase(status)) return null;
		try {
			return ClaimStatus.valueOf(status.toUpperCase(Locale.ROOT));
		}
		catch (IllegalArgumentException e) {
			throw new BadRequestException("status must be one of PENDING, APPROVED, REJECTED, WITHDRAWN or ALL");
		}
	}
}
