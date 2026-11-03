package com.makanmatch.account_service.owner;

import java.util.List;
import java.util.UUID;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.makanmatch.account_service.owner.dto.OwnedVenueResponse;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;

@RestController
@RequestMapping("/api/owner/venues")
@Tag(name = "Owner", description = "Venues the signed-in owner manages (needs the OWNER role)")
@SecurityRequirement(name = "bearer")
public class OwnerController {

	private final OwnershipService ownership;

	public OwnerController(OwnershipService ownership) {
		this.ownership = ownership;
	}

	@GetMapping
	@Operation(summary = "List the venues I manage")
	public List<OwnedVenueResponse> myVenues(@AuthenticationPrincipal Jwt jwt) {
		return ownership.ownedBy(UUID.fromString(jwt.getSubject()));
	}
}
